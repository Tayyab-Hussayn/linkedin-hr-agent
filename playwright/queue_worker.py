"""
queue_worker.py - Scheduled Post Publisher
Runs as a standalone service (systemd).
Polls DB every 60 seconds for posts due to publish.
Spawns Playwright to publish them.
Completely independent of Flask and n8n.
"""

import time
import json
import sys
import subprocess
import psycopg2
import psycopg2.extras
from datetime import datetime

# Configuration
DB_CONFIG = {
    "host": "localhost",
    "port": 5433,
    "database": "linkedin_agent",
    "user": "hragent",
    "password": "hragent123"
}

PLAYWRIGHT_DIR = "/home/krawin/exp.code/linkedin-hr-agent/playwright"
POLL_INTERVAL = 60
MAX_RETRIES = 3
RETRY_DELAY = 300

# Logging
def log(level, msg):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] [{level}] {msg}", flush=True)

def info(msg):  log("INFO", msg)
def warn(msg):  log("WARN", msg)
def error(msg): log("ERROR", msg)

# Database
def get_db():
    return psycopg2.connect(**DB_CONFIG)

def get_due_posts():
    try:
        conn = get_db()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("""
            SELECT 
                p.id,
                p.client_id,
                p.content,
                p.post_format,
                p.topic_pillar,
                p.scheduled_for,
                p.retry_count,
                c.linkedin_email,
                c.linkedin_password,
                c.name as client_name
            FROM posts p
            JOIN clients c ON c.id = p.client_id
            WHERE 
                p.approval_status = 'approved'
                AND p.post_status = 'draft'
                AND (
                    p.scheduled_for IS NULL 
                    OR p.scheduled_for <= NOW()
                )
                AND (p.retry_count IS NULL OR p.retry_count < %s)
            ORDER BY p.scheduled_for ASC NULLS FIRST
            LIMIT 5
        """, (MAX_RETRIES,))
        posts = cur.fetchall()
        cur.close()
        conn.close()
        return [dict(p) for p in posts]
    except Exception as e:
        error(f"Failed to fetch due posts: {e}")
        return []

def update_post_status(post_id, status, increment_retry=False):
    try:
        conn = get_db()
        cur = conn.cursor()
        if status == 'published':
            cur.execute("""
                UPDATE posts 
                SET post_status = %s, 
                    published_at = NOW(),
                    approval_status = 'approved'
                WHERE id = %s
            """, (status, post_id))
        elif increment_retry:
            cur.execute("""
                UPDATE posts 
                SET post_status = 'draft',
                    retry_count = COALESCE(retry_count, 0) + 1
                WHERE id = %s
            """, (post_id,))
        else:
            cur.execute("""
                UPDATE posts SET post_status = %s WHERE id = %s
            """, (status, post_id))
        conn.commit()
        cur.close()
        conn.close()
        info(f"Post {post_id[:8]}... status updated to {status}")
    except Exception as e:
        error(f"DB update failed for {post_id}: {e}")

def mark_publishing(post_id):
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            UPDATE posts 
            SET post_status = 'publishing'
            WHERE id = %s AND post_status = 'draft'
            RETURNING id
        """, (post_id,))
        result = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return result is not None
    except Exception as e:
        error(f"Failed to lock post {post_id}: {e}")
        return False

# Publisher
def publish_post(post):
    post_id = post['id']
    client_name = post.get('client_name', 'unknown')

    info(f"Publishing post {post_id[:8]}... for {client_name}")
    info(f"Topic: {post.get('topic_pillar', 'unknown')}")

    if not mark_publishing(post_id):
        warn(f"Post {post_id[:8]}... already being processed - skipping")
        return

    payload = {
        "action": "post",
        "post_id": post_id,
        "content": post['content'],
        "email": post['linkedin_email'],
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

        output_lines = result.stdout.strip().split('\n')
        action_result = {}
        for line in output_lines:
            try:
                parsed = json.loads(line)
                if 'status' in parsed:
                    action_result = parsed
            except:
                pass

        if result.returncode == 0 and action_result.get('status') == 'ok':
            update_post_status(post_id, 'published')
            info(f"SUCCESS: Post {post_id[:8]}... published")
        else:
            error_msg = action_result.get('message', result.stderr[:200])
            error(f"FAILED: Post {post_id[:8]}... - {error_msg}")
            update_post_status(post_id, 'failed', increment_retry=True)

    except Exception as e:
        error(f"Exception publishing {post_id[:8]}...: {e}")
        update_post_status(post_id, 'failed', increment_retry=True)

# Schema Migration
def ensure_schema():
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("ALTER TABLE posts ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMP;")
        cur.execute("ALTER TABLE posts ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0;")
        cur.execute("ALTER TABLE posts ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMP;")
        conn.commit()
        cur.close()
        conn.close()
        info("Schema check complete")
    except Exception as e:
        error(f"Schema migration failed: {e}")

# Main Loop
def main():
    info("PostFlow Queue Worker starting...")
    info(f"Poll interval: {POLL_INTERVAL}s | Max retries: {MAX_RETRIES}")
    info(f"Playwright dir: {PLAYWRIGHT_DIR}")

    ensure_schema()
    info("Worker ready - polling for scheduled posts")

    while True:
        try:
            due_posts = get_due_posts()
            if due_posts:
                info(f"Found {len(due_posts)} post(s) due to publish")
                for post in due_posts:
                    publish_post(post)
            else:
                info("No posts due - sleeping")
        except KeyboardInterrupt:
            info("Shutting down gracefully...")
            sys.exit(0)
        except Exception as e:
            error(f"Main loop error: {e}")

        time.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    main()
