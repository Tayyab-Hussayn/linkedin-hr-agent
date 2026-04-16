"""
queue_worker_v5.py - Qalam Scheduled Post Publisher v5
- No direct DB connection — uses Flask API
- API_BASE_URL configurable via environment variable
- PLAYWRIGHT_DIR relative to script location
- Timezone aware (client's local timezone)
- Strict scheduled_for <= NOW() check
- Retry with exponential backoff
- Works in Tauri desktop app environment
"""

import time
import json
import sys
import os
import subprocess
import requests
from datetime import datetime, timezone, timedelta
from pathlib import Path
import zoneinfo

# ── Configuration ─────────────────────────────────────────────
# API_BASE_URL: Flask API server URL
# In development: http://localhost:5050
# In production (Tauri): https://api.byqalam.com
API_BASE_URL = os.environ.get('QALAM_API_URL', 'http://localhost:5050')

# AUTH_TOKEN: JWT token for authenticated API calls
# Read dynamically on each request — supports token refresh without restart

# PLAYWRIGHT_DIR: directory containing linkedin_actions.py
# When running as PyInstaller bundle:
# - sys.frozen is True
# - sys.executable points to the bundled exe
# - QALAM_RESOURCES_DIR env var set by Tauri points
#   to the directory containing linkedin_actions.py
if getattr(sys, 'frozen', False):
    # Running as PyInstaller bundle
    resources_dir = os.environ.get('QALAM_RESOURCES_DIR', '')
    if resources_dir:
        PLAYWRIGHT_DIR = Path(resources_dir)
    else:
        # Fallback: same directory as the executable
        PLAYWRIGHT_DIR = Path(sys.executable).parent
else:
    # Running as regular Python script (development)
    PLAYWRIGHT_DIR = Path(__file__).parent.resolve()

print(f"[CONFIG] PLAYWRIGHT_DIR: {PLAYWRIGHT_DIR}", flush=True)

# Timezone — read from environment or default to Asia/Karachi
# Tauri app will set QALAM_TIMEZONE after user sets it
TZ_NAME = os.environ.get('QALAM_TIMEZONE', 'Asia/Karachi')
try:
    LOCAL_TZ = zoneinfo.ZoneInfo(TZ_NAME)
except Exception:
    LOCAL_TZ = timezone.utc

POLL_INTERVAL  = 60   # seconds between polls
MAX_RETRIES    = 3
CLEANUP_EVERY  = 1440 # cycles (~24h)

# ── Logging ────────────────────────────────────────────────────
def now_local():
    return datetime.now(LOCAL_TZ)

def log(level, msg):
    ts = now_local().strftime('%Y-%m-%d %H:%M:%S %Z')
    print(f"[{ts}] [{level}] {msg}", flush=True)

def info(msg):  log('INFO',  msg)
def warn(msg):  log('WARN',  msg)
def error(msg): log('ERROR', msg)

# ── API Client ─────────────────────────────────────────────────
def get_auth_token():
    """Read current JWT token - refreshed by Tauri on each login."""
    token = os.environ.get('QALAM_AUTH_TOKEN', '')
    if token:
        return token

    token_file = PLAYWRIGHT_DIR / 'qalam_token.txt'
    if token_file.exists():
        try:
            return token_file.read_text().strip()
        except Exception:
            pass
    return ''

def api_headers():
    headers = {'Content-Type': 'application/json'}
    token = get_auth_token()
    if token:
        headers['Authorization'] = f'Bearer {token}'
    return headers

def api_get(path):
    """GET request to Flask API."""
    try:
        r = requests.get(
            f'{API_BASE_URL}{path}',
            headers=api_headers(),
            timeout=30
        )
        if r.status_code == 401:
            error('API returned 401 — token expired or invalid. Re-open Qalam and log in again.')
            return None
        r.raise_for_status()
        return r.json()
    except requests.exceptions.ConnectionError:
        error(f'API unreachable: {API_BASE_URL}')
        return None
    except Exception as e:
        error(f'API GET {path} failed: {e}')
        return None

def api_post(path, data=None):
    """POST request to Flask API."""
    try:
        r = requests.post(
            f'{API_BASE_URL}{path}',
            headers=api_headers(),
            json=data or {},
            timeout=30
        )
        if r.status_code == 401:
            error('API returned 401 — token expired or invalid. Re-open Qalam and log in again.')
            return None
        r.raise_for_status()
        return r.json()
    except requests.exceptions.ConnectionError:
        error(f'API unreachable: {API_BASE_URL}')
        return None
    except Exception as e:
        error(f'API POST {path} failed: {e}')
        return None

# ── Post Operations via API ────────────────────────────────────
def get_due_posts():
    """Fetch posts that are due for publishing."""
    result = api_get('/api/worker/due-posts')
    if not result:
        return []
    return result.get('posts', [])

def get_upcoming_posts():
    """Fetch upcoming scheduled posts for display."""
    result = api_get('/api/worker/upcoming-posts')
    if not result:
        return []
    return result.get('posts', [])

def mark_publishing(post_id):
    """Atomically lock post for publishing."""
    result = api_post('/api/worker/mark-publishing', {'post_id': post_id})
    if not result:
        return False
    return result.get('locked', False)

def update_post_published(post_id):
    """Mark post as successfully published."""
    api_post('/api/worker/mark-published', {'post_id': post_id})

def update_post_failed(post_id, retry_count):
    """Mark post as failed, schedule retry or permanent failure."""
    api_post('/api/worker/mark-failed', {
        'post_id': post_id,
        'retry_count': retry_count
    })

def run_cleanup():
    """Trigger cleanup of old/stale posts."""
    api_post('/api/worker/cleanup')

# ── Publishing ─────────────────────────────────────────────────
def publish_post(post):
    """Run Playwright to publish a post to LinkedIn."""
    post_id     = post['id']
    retry_count = post.get('retry_count', 0)
    client_name = post.get('client_name', 'unknown')
    sched_local = post.get('scheduled_for_local', post.get('scheduled_for'))

    attempt_label = f"attempt {retry_count + 1}/{MAX_RETRIES}"
    info(f"Publishing {post_id[:8]}... for {client_name} [{attempt_label}]")
    info(f"Topic: {post.get('topic_pillar')} | Scheduled: {sched_local}")

    if not mark_publishing(post_id):
        warn(f"Post {post_id[:8]}... already locked — skipping")
        return

    linkedin_email    = post.get('linkedin_email', '')
    linkedin_password = post.get('linkedin_password', '')

    if not linkedin_email or not linkedin_password:
        error(f"Post {post_id[:8]}... missing LinkedIn credentials")
        update_post_failed(post_id, retry_count)
        return

    payload = {
        "action":   "post",
        "post_id":  post_id,
        "content":  post['content'],
        "email":    linkedin_email,
        "password": linkedin_password
    }

    try:
        # Find correct python executable
        if getattr(sys, 'frozen', False):
            # Running as PyInstaller bundle
            # sys.executable is the bundle — NOT Python
            python_exec = None

            # Try QALAM_PYTHON env var first
            qalam_python = os.environ.get('QALAM_PYTHON', '')
            if qalam_python and Path(qalam_python).exists():
                python_exec = Path(qalam_python)

            if not python_exec:
                # Try common Python locations
                for candidate in [
                    '/usr/bin/python3',
                    '/usr/local/bin/python3',
                    '/usr/bin/python',
                    str(Path.home() / '.pyenv/versions/3.11.9/bin/python3'),
                    str(Path.home() / '.pyenv/shims/python3'),
                ]:
                    if Path(candidate).exists():
                        python_exec = Path(candidate)
                        break

            if not python_exec:
                # Last resort — use 'python3' from PATH
                import shutil
                found = shutil.which('python3') or shutil.which('python')
                if found:
                    python_exec = Path(found)

            if not python_exec:
                error(f"Cannot find Python interpreter. Set QALAM_PYTHON env var.")
                update_post_failed(post_id, retry_count)
                return
        else:
            # Development mode — use venv python
            python_venv = PLAYWRIGHT_DIR / 'venv' / 'bin' / 'python'
            python_exec = python_venv if python_venv.exists() else Path(sys.executable)

        print(f"[DEBUG] Using Python: {python_exec}", flush=True)

        python_exec_path = str(python_exec)
        actions_path = str(PLAYWRIGHT_DIR / 'linkedin_actions.py')

        print(f"[DEBUG] Python: {python_exec_path}", flush=True)
        print(f"[DEBUG] Script: {actions_path}", flush=True)
        print(f"[DEBUG] Script exists: {Path(actions_path).exists()}", flush=True)
        print(f"[DEBUG] Python exists: {Path(python_exec_path).exists()}", flush=True)

        result = subprocess.run(
            [python_exec_path, actions_path],
            input=json.dumps(payload),
            capture_output=True,
            text=True,
            timeout=120,
            cwd=str(PLAYWRIGHT_DIR)
        )

        print(f"[DEBUG] Return code: {result.returncode}", flush=True)
        print(f"[DEBUG] Stdout: {result.stdout[:500]}", flush=True)
        print(f"[DEBUG] Stderr: {result.stderr[:500]}", flush=True)

        action_result = {}
        for line in result.stdout.strip().split('\n'):
            try:
                parsed = json.loads(line)
                if 'status' in parsed:
                    action_result = parsed
            except Exception:
                pass

        if result.returncode == 0 and action_result.get('status') == 'ok':
            update_post_published(post_id)
            info(f"SUCCESS: {post_id[:8]}... published to LinkedIn")
        else:
            err_msg = action_result.get('message',
                result.stderr[:200] if result.stderr else 'Unknown error')
            error(f"FAILED: {post_id[:8]}... — {err_msg}")
            update_post_failed(post_id, retry_count)

    except subprocess.TimeoutExpired:
        error(f"TIMEOUT: {post_id[:8]}... exceeded 120 seconds")
        update_post_failed(post_id, retry_count)
    except Exception as e:
        error(f"EXCEPTION: {post_id[:8]}... — {e}")
        import traceback
        print(f"[DEBUG] Traceback: {traceback.format_exc()}", flush=True)
        update_post_failed(post_id, retry_count)

# ── Main Loop ──────────────────────────────────────────────────
def main():
    info("=" * 55)
    info("  Qalam Queue Worker v5")
    info(f"  API Server    : {API_BASE_URL}")
    info(f"  Timezone      : {TZ_NAME}")
    info(f"  Poll interval : {POLL_INTERVAL}s")
    info(f"  Max retries   : {MAX_RETRIES}")
    info(f"  Playwright    : {PLAYWRIGHT_DIR}")
    info(f"  Cleanup every : {CLEANUP_EVERY} cycles (~24h)")
    info("=" * 55)

    # Verify API is reachable before starting
    health = api_get('/health')
    if health:
        info(f"API connected: {API_BASE_URL}")
    else:
        warn(f"API not reachable at {API_BASE_URL} — will retry on each cycle")

    local_now = now_local()
    info(f"Current local time: {local_now.strftime('%Y-%m-%d %H:%M:%S %Z')}")

    upcoming = get_upcoming_posts()
    if upcoming:
        info(f"Upcoming scheduled posts ({len(upcoming)}):")
        for p in upcoming:
            retry_info = f" [retry {p.get('retry_count', 0)}]" if p.get('retry_count', 0) > 0 else ""
            sched = p.get('scheduled_local', p.get('scheduled_for', '?'))
            info(f"  [{p.get('topic_pillar', '?')}] at {sched}{retry_info}")
    else:
        info("No upcoming posts — waiting for approvals")

    info("Worker ready — strict schedule enforcement")

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
                        sched = next_p.get('scheduled_local', next_p.get('scheduled_for', '?'))
                        info(f"[Cycle {cycle}] Next: [{next_p.get('topic_pillar', '?')}] at {sched}")
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
