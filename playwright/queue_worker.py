"""
queue_worker.py - Scheduled Post Publisher v4
- Timezone aware (Asia/Karachi / PKT UTC+5)
- All times stored as UTC in DB, displayed in local TZ
- Strict scheduled_for <= NOW() check
- Retry with exponential backoff
- Daily cleanup
"""

import time
import json
import sys
import subprocess
import psycopg2
import psycopg2.extras
from datetime import datetime, timezone
import zoneinfo

DB_CONFIG = {
    "host": "localhost",
    "port": 5433,
    "database": "linkedin_agent",
    "user": "hragent",
    "password": "hragent123"
}

PLAYWRIGHT_DIR  = "/home/krawin/exp.code/linkedin-hr-agent/playwright"
LOCAL_TZ        = zoneinfo.ZoneInfo("Asia/Karachi")
POLL_INTERVAL   = 60
MAX_RETRIES     = 3
CLEANUP_EVERY   = 1440  # cycles (~24 hours)

# ── Logging ───────────────────────────────────────────────────────────────────

def now_local():
    return datetime.now(LOCAL_TZ)

def log(level, msg):
    timestamp = now_local().strftime("%Y-%m-%d %H:%M:%S %Z")
    print(f"[{timestamp}] [{level}] {msg}", flush=True)

def info(msg):  log("INFO",  msg)
def warn(msg):  log("WARN",  msg)
def error(msg): log("ERROR", msg)

# ── Database ──────────────────────────────────────────────────────────────────

def get_db():
    return psycopg2.connect(**DB_CONFIG)

def get_due_posts():
    try:
        conn = get_db()
        cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT
                p.id, p.client_id, p.content, p.post_format,
                p.topic_pillar,
                p.scheduled_for AT TIME ZONE 'Asia/Karachi' as scheduled_for_local,
                p.scheduled_for,
                COALESCE(p.retry_count, 0) as retry_count,
                c.linkedin_email, c.linkedin_password,
                c.name as client_name
            FROM posts p
            JOIN clients c ON c.id = p.client_id
            WHERE
                p.approval_status = 'approved'
                AND p.post_status  = 'draft'
                AND p.scheduled_for IS NOT NULL
                AND p.scheduled_for <= NOW()
                AND COALESCE(p.retry_count, 0) < %s
            ORDER BY p.scheduled_for ASC
            LIMIT 5
        """, (MAX_RETRIES,))
        posts = cur.fetchall()
        cur.close(); conn.close()
        return [dict(p) for p in posts]
    except Exception as e:
        error(f"Failed to fetch due posts: {e}")
        return []

def get_upcoming_posts():
    try:
        conn = get_db()
        cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT 
                p.id, p.topic_pillar,
                p.scheduled_for AT TIME ZONE 'Asia/Karachi' as scheduled_local,
                COALESCE(p.retry_count, 0) as retry_count,
                c.name as client_name
            FROM posts p
            JOIN clients c ON c.id = p.client_id
            WHERE
                p.approval_status = 'approved'
                AND p.post_status  = 'draft'
                AND p.scheduled_for IS NOT NULL
                AND p.scheduled_for > NOW()
            ORDER BY p.scheduled_for ASC
            LIMIT 5
        """)
        posts = cur.fetchall()
        cur.close(); conn.close()
        return [dict(p) for p in posts]
    except Exception as e:
        return []

def mark_publishing(post_id):
    try:
        conn = get_db()
        cur  = conn.cursor()
        cur.execute("""
            UPDATE posts
            SET post_status = 'publishing'
            WHERE id = %s
              AND post_status     = 'draft'
              AND approval_status = 'approved'
              AND scheduled_for  <= NOW()
            RETURNING id
        """, (post_id,))
        result = cur.fetchone()
        conn.commit(); cur.close(); conn.close()
        return result is not None
    except Exception as e:
        error(f"Failed to lock post {post_id}: {e}")
        return False

def update_post_published(post_id):
    try:
        conn = get_db()
        cur  = conn.cursor()
        cur.execute("""
            UPDATE posts
            SET post_status = 'published', published_at = NOW()
            WHERE id = %s
        """, (post_id,))
        conn.commit(); cur.close(); conn.close()
        info(f"Post {post_id[:8]}... → published")
    except Exception as e:
        error(f"DB update failed for {post_id}: {e}")

def update_post_failed(post_id, retry_count):
    next_retry = retry_count + 1
    try:
        conn = get_db()
        cur  = conn.cursor()
        if next_retry >= MAX_RETRIES:
            cur.execute("""
                UPDATE posts
                SET post_status   = 'failed',
                    retry_count   = %s,
                    approval_note = 'Max retries exhausted after ' || %s || ' attempts'
                WHERE id = %s
            """, (next_retry, next_retry, post_id))
            warn(f"Post {post_id[:8]}... permanently failed after {next_retry} attempts")
        else:
            backoff_minutes = [10, 30, 60][min(next_retry - 1, 2)]
            cur.execute("""
                UPDATE posts
                SET post_status   = 'draft',
                    retry_count   = %s,
                    scheduled_for = NOW() + INTERVAL '%s minutes'
                WHERE id = %s
            """, (next_retry, backoff_minutes, post_id))
            info(f"Post {post_id[:8]}... retry {next_retry}/{MAX_RETRIES} in {backoff_minutes}m")
        conn.commit(); cur.close(); conn.close()
    except Exception as e:
        error(f"DB retry update failed for {post_id}: {e}")

def run_cleanup():
    try:
        conn = get_db()
        cur  = conn.cursor()
        cur.execute("SELECT cleanup_posts();")
        conn.commit(); cur.close(); conn.close()
        info("Daily cleanup completed")
    except Exception as e:
        error(f"Cleanup failed: {e}")

def ensure_schema():
    try:
        conn = get_db()
        cur  = conn.cursor()
        cur.execute("ALTER TABLE posts ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMP WITH TIME ZONE;")
        cur.execute("ALTER TABLE posts ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0;")
        conn.commit(); cur.close(); conn.close()
        info("Schema check complete")
    except Exception as e:
        error(f"Schema check failed: {e}")

# ── Publisher ─────────────────────────────────────────────────────────────────

def publish_post(post):
    post_id      = post['id']
    retry_count  = post.get('retry_count', 0)
    client_name  = post.get('client_name', 'unknown')
    sched_local  = post.get('scheduled_for_local', post.get('scheduled_for'))

    attempt_label = f"attempt {retry_count + 1}/{MAX_RETRIES}"
    info(f"Publishing {post_id[:8]}... for {client_name} [{attempt_label}]")
    info(f"Topic: {post.get('topic_pillar')} | Scheduled (PKT): {sched_local}")

    if not mark_publishing(post_id):
        warn(f"Post {post_id[:8]}... already locked — skipping")
        return

    payload = {
        "action":   "post",
        "post_id":  post_id,
        "content":  post['content'],
        "email":    post['linkedin_email'],
        "password": post['linkedin_password']
    }

    try:
        result = subprocess.run(
            [
                f"{PLAYWRIGHT_DIR}/venv/bin/python",
                f"{PLAYWRIGHT_DIR}/linkedin_actions.py",
                json.dumps(payload)
            ],
            capture_output=True,
            text=True,
            timeout=None,
            cwd=PLAYWRIGHT_DIR
        )

        action_result = {}
        for line in result.stdout.strip().split('\n'):
            try:
                parsed = json.loads(line)
                if 'status' in parsed:
                    action_result = parsed
            except:
                pass

        if result.returncode == 0 and action_result.get('status') == 'ok':
            update_post_published(post_id)
            info(f"SUCCESS: {post_id[:8]}... published to LinkedIn")
        else:
            err_msg = action_result.get('message', result.stderr[:200])
            error(f"FAILED: {post_id[:8]}... — {err_msg}")
            update_post_failed(post_id, retry_count)

    except Exception as e:
        error(f"Exception publishing {post_id[:8]}...: {e}")
        update_post_failed(post_id, retry_count)

# ── Main Loop ─────────────────────────────────────────────────────────────────

def main():
    info("=" * 55)
    info("  PostFlow Queue Worker v4")
    info(f"  Timezone      : Asia/Karachi (PKT UTC+5)")
    info(f"  Poll interval : {POLL_INTERVAL}s")
    info(f"  Max retries   : {MAX_RETRIES}")
    info(f"  Cleanup every : {CLEANUP_EVERY} cycles (~24h)")
    info("=" * 55)

    ensure_schema()

    local_now = now_local()
    info(f"Current local time: {local_now.strftime('%Y-%m-%d %H:%M:%S %Z')}")

    upcoming = get_upcoming_posts()
    if upcoming:
        info(f"Upcoming scheduled posts ({len(upcoming)}):")
        for p in upcoming:
            retry_info = f" [retry {p['retry_count']}]" if p['retry_count'] > 0 else ""
            info(f"  [{p['topic_pillar']}] at {p['scheduled_local']} PKT{retry_info}")
    else:
        info("No upcoming posts — waiting for approvals")

    info("Worker ready — strict schedule enforcement | timezone: PKT")

    cycle = 0
    while True:
        try:
            cycle += 1

            if cycle % CLEANUP_EVERY == 0:
                info(f"[Cycle {cycle}] Running daily cleanup...")
                run_cleanup()

            due_posts = get_due_posts()

            if due_posts:
                info(f"[Cycle {cycle}] {len(due_posts)} post(s) due — publishing")
                for post in due_posts:
                    publish_post(post)
            else:
                if cycle % 5 == 0:
                    upcoming = get_upcoming_posts()
                    if upcoming:
                        next_p = upcoming[0]
                        info(f"[Cycle {cycle}] Next: [{next_p['topic_pillar']}] at {next_p['scheduled_local']} PKT")
                    else:
                        info(f"[Cycle {cycle}] Queue empty — sleeping")
                else:
                    info(f"[Cycle {cycle}] No posts due — sleeping {POLL_INTERVAL}s")

        except KeyboardInterrupt:
            info("Shutting down gracefully...")
            sys.exit(0)
        except Exception as e:
            error(f"Main loop error: {e}")

        time.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    main()
