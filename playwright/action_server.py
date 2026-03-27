# playwright/action_server.py
import subprocess
import json
import sys
import signal
import psycopg2
import psycopg2.extras
import urllib.request
from datetime import datetime, timezone, timedelta
from flask import Flask, request, jsonify
from config import DB_CONFIG, CLIENT_ID, N8N_GENERATE_NOW_WEBHOOK

signal.signal(signal.SIGCHLD, signal.SIG_DFL)

app = Flask(__name__)

def db_query(sql, params=None, fetch=True):
    """Execute a DB query and return results"""
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute(sql, params or [])
        if fetch:
            result = cur.fetchall()
            conn.commit()
            return [dict(row) for row in result]
        else:
            conn.commit()
            return cur.rowcount
    finally:
        cur.close()
        conn.close()

def cors_response(data, status=200):
    """Return JSON response with CORS headers"""
    response = jsonify(data)
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return response, status

@app.before_request
def handle_options():
    """Handle OPTIONS preflight requests"""
    if request.method == 'OPTIONS':
        response = jsonify({})
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response, 200

def update_post_status(post_id, status):
    """Update post status in database"""
    if not post_id:
        return
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()
        if status == 'published':
            cur.execute(
                "UPDATE posts SET post_status = %s, published_at = NOW() WHERE id = %s",
                (status, post_id)
            )
        else:
            cur.execute(
                "UPDATE posts SET post_status = %s WHERE id = %s",
                (status, post_id)
            )
        conn.commit()
        cur.close()
        conn.close()
        print(f"[DB] Updated post {post_id} status to {status}", file=sys.stderr)
    except Exception as e:
        print(f"[DB ERROR] {str(e)}", file=sys.stderr)

@app.route('/execute', methods=['POST'])
def execute():
    # Log the full incoming request
    print(f"[REQUEST] Method: {request.method}", file=sys.stderr)
    print(f"[REQUEST] Headers: {dict(request.headers)}", file=sys.stderr)
    print(f"[REQUEST] Raw body: {request.get_data(as_text=True)}", file=sys.stderr)

    try:
        payload = request.get_json()
        if not payload:
            return jsonify({"status": "error", "message": "No JSON payload"}), 400

        # Extract post_id if present
        post_id = payload.get('post_id')

        # Update status to 'publishing' before starting
        if post_id and payload.get('action') == 'post':
            update_post_status(post_id, 'publishing')

        # Run linkedin_actions.py with the payload
        result = subprocess.run(
            ['python', 'linkedin_actions.py', json.dumps(payload)],
            capture_output=True,
            text=True,
            timeout=None,
            cwd='/home/krawin/exp.code/linkedin-hr-agent/playwright'
        )

        # Parse stdout for status updates
        stdout_lines = result.stdout.strip().split('\n')
        status_updates = []
        last_line = ''

        for line in stdout_lines:
            try:
                parsed = json.loads(line)
                if 'status_update' in parsed:
                    status_updates.append(parsed['status_update'])
                    print(f"[STATUS UPDATE] {parsed['status_update']}", file=sys.stderr)
                last_line = line
            except:
                pass

        # Update final status based on exit code and status updates
        if post_id and payload.get('action') == 'post':
            if result.returncode == 0:
                # Success - check if we got a published status update
                if 'published' in status_updates:
                    update_post_status(post_id, 'published')
                else:
                    # Subprocess succeeded but no explicit published status
                    update_post_status(post_id, 'published')
            else:
                # Failed
                update_post_status(post_id, 'failed')

        # Parse last line of stdout as JSON result
        try:
            action_result = json.loads(last_line)
        except:
            action_result = {
                "status": "error",
                "message": f"Could not parse output: {last_line[:200]}"
            }

        return jsonify({
            "status": action_result.get("status", "error"),
            "message": action_result.get("message", ""),
            "action": payload.get("action"),
            "exit_code": result.returncode,
            "stdout": result.stdout[:500],
            "stderr": result.stderr[:200]
        })

    except Exception as e:
        # Update status to failed if we have a post_id
        if 'post_id' in locals() and post_id:
            update_post_status(post_id, 'failed')
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "f**king ok", "service": "playwright-action-server"})

# ═══════════════════════════════════════════
# NEW ENDPOINT 1 — GET /api/posts
# Replaces n8n 04 get-posts webhook
# ═══════════════════════════════════════════

@app.route('/api/posts', methods=['GET', 'OPTIONS'])
def get_posts():
    status = request.args.get('status', 'queue')
    client_id = request.args.get('client_id', CLIENT_ID)
    limit = int(request.args.get('limit', 20))

    if status == 'stats':
        return get_stats_internal(client_id)

    # Map status param to SQL conditions
    # queue = pending approval
    # scheduled = approved + draft with scheduled_for set
    # history = published or skipped
    # analytics = published with analytics data

    if status == 'queue':
        where = "approval_status = 'pending' AND post_status = 'draft'"
    elif status == 'scheduled':
        where = "approval_status = 'approved' AND post_status = 'draft' AND scheduled_for IS NOT NULL"
    elif status == 'history':
        where = "post_status IN ('published', 'skipped')"
    elif status == 'analytics':
        where = "post_status = 'published'"
    else:
        where = "approval_status = 'pending' AND post_status = 'draft'"

    rows = db_query(f"""
        SELECT
            id, client_id, content, topic_pillar, post_format,
            approval_status, post_status, approval_note,
            scheduled_for, published_at, created_at,
            retry_count
        FROM posts
        WHERE client_id = %s AND {where}
        ORDER BY created_at DESC
        LIMIT %s
    """, [client_id, limit])

    # Format dates as ISO strings
    for row in rows:
        for key in ['scheduled_for', 'published_at', 'created_at']:
            if row.get(key):
                row[key] = row[key].isoformat()

    return cors_response({
        "status": "ok",
        "posts": rows,
        "count": len(rows)
    })

# ═══════════════════════════════════════════
# NEW ENDPOINT 2 — GET /api/stats
# Internal helper + standalone endpoint
# ═══════════════════════════════════════════

def get_stats_internal(client_id=None):
    cid = client_id or CLIENT_ID
    rows = db_query("""
        SELECT
            COUNT(CASE WHEN p.approval_status = 'pending' THEN 1 END)::int as pending,
            COUNT(CASE WHEN p.approval_status = 'approved'
                AND p.post_status NOT IN ('published','skipped') THEN 1 END)::int as approved,
            COUNT(CASE WHEN p.post_status = 'published' THEN 1 END)::int as published,
            COUNT(CASE WHEN p.approval_status = 'rejected' THEN 1 END)::int as rejected,
            COUNT(*)::int as total,
            COUNT(CASE WHEN p.created_at >= CURRENT_DATE THEN 1 END)::int as generated_today,
            cel.daily_post_limit,
            cel.plan_name,
            cel.can_schedule,
            cel.can_analytics,
            cel.can_generate_now,
            cel.ai_model,
            cel.monthly_post_limit
        FROM posts p
        CROSS JOIN client_effective_limits cel
        WHERE cel.client_id = %s
        GROUP BY cel.daily_post_limit, cel.plan_name, cel.can_schedule,
            cel.can_analytics, cel.can_generate_now, cel.ai_model, cel.monthly_post_limit
    """, [cid])

    if not rows:
        return cors_response({"status": "error", "message": "Client not found"}, 404)

    data = rows[0]
    data['type'] = 'stats'
    return cors_response(data)

@app.route('/api/stats', methods=['GET', 'OPTIONS'])
def get_stats():
    client_id = request.args.get('client_id', CLIENT_ID)
    return get_stats_internal(client_id)

# ═══════════════════════════════════════════
# NEW ENDPOINT 3 — POST /api/approve
# Replaces DB update part of n8n 03
# ═══════════════════════════════════════════

def compute_next_slot(client_id):
    """Compute next available publishing slot in PKT"""
    PKT = timezone(timedelta(hours=5))
    now = datetime.now(PKT)

    # Get client slots from DB
    rows = db_query(
        "SELECT publishing_slots FROM clients WHERE id = %s",
        [client_id]
    )
    slots = ['18:00']
    if rows and rows[0].get('publishing_slots'):
        raw = rows[0]['publishing_slots']
        if isinstance(raw, list):
            slots = raw
        elif isinstance(raw, str):
            slots = json.loads(raw)

    slots.sort()

    today_str = now.strftime('%Y-%m-%d')
    for slot in slots:
        slot_dt = datetime.fromisoformat(f"{today_str}T{slot}:00+05:00")
        if slot_dt.timestamp() > now.timestamp() + 120:
            return slot_dt.isoformat()

    # All slots passed — use first slot tomorrow
    tomorrow = now + timedelta(days=1)
    tomorrow_str = tomorrow.strftime('%Y-%m-%d')
    return datetime.fromisoformat(f"{tomorrow_str}T{slots[0]}:00+05:00").isoformat()

@app.route('/api/approve', methods=['POST', 'OPTIONS'])
def approve_post():
    body = request.get_json() or {}
    post_id = body.get('post_id')
    decision = body.get('decision')  # approved | rejected | edited
    scheduled_for = body.get('scheduled_for')
    rejection_reason = body.get('rejection_reason') or body.get('approval_note')
    content = body.get('content')

    if not post_id or not decision:
        return cors_response({"status": "error", "message": "post_id and decision required"}, 400)

    # Fetch post
    posts = db_query("SELECT * FROM posts WHERE id = %s", [post_id])
    if not posts:
        return cors_response({"status": "error", "message": "Post not found"}, 404)

    post = posts[0]

    if post['post_status'] == 'published':
        return cors_response({"status": "error", "message": "Post already published"}, 400)

    # Guard against duplicate approval
    if post['approval_status'] == 'approved' and decision == 'approved':
        return cors_response({
            "status": "error",
            "message": f"Post {post_id} is already approved"
        }, 400)

    final_decision = 'approved' if decision == 'edited' else decision
    final_content = content if decision == 'edited' and content else post['content']

    if final_decision == 'approved':
        # Compute scheduled_for if not provided
        if not scheduled_for:
            scheduled_for = compute_next_slot(post.get('client_id', CLIENT_ID))

        db_query("""
            UPDATE posts SET
                approval_status = 'approved',
                post_status = 'draft',
                content = %s,
                scheduled_for = %s,
                approved_at = NOW()
            WHERE id = %s
        """, [final_content, scheduled_for, post_id], fetch=False)

        # Build human readable display time
        scheduled_display = ''
        try:
            PKT = timezone(timedelta(hours=5))
            d = datetime.fromisoformat(scheduled_for.replace('Z', '+00:00'))
            d_pkt = d.astimezone(PKT)
            scheduled_display = d_pkt.strftime('%a, %b %d at %I:%M %p')
        except:
            scheduled_display = str(scheduled_for)

        return cors_response({
            "status": "ok",
            "decision": "approved",
            "post_id": post_id,
            "scheduled_for": scheduled_for,
            "scheduled_display": scheduled_display,
            "message": f"Post approved and scheduled for {scheduled_display}"
        })

    elif final_decision == 'rejected':
        db_query("""
            UPDATE posts SET
                approval_status = 'rejected',
                post_status = 'skipped',
                approval_note = %s
            WHERE id = %s
        """, [rejection_reason, post_id], fetch=False)

        return cors_response({
            "status": "ok",
            "decision": "rejected",
            "post_id": post_id,
            "message": "Post rejected. A new post will be generated in the next run."
        })

# ═══════════════════════════════════════════
# NEW ENDPOINT 4 — POST /api/publish-now
# Replaces n8n 06 publish-now webhook
# ═══════════════════════════════════════════

@app.route('/api/publish-now', methods=['POST', 'OPTIONS'])
def publish_now():
    body = request.get_json() or {}
    post_id = body.get('post_id')

    if not post_id:
        return cors_response({"status": "error", "message": "post_id required"}, 400)

    updated = db_query("""
        UPDATE posts
        SET scheduled_for = NOW()
        WHERE id = %s
            AND approval_status = 'approved'
            AND post_status = 'draft'
        RETURNING id, scheduled_for
    """, [post_id])

    if not updated:
        return cors_response({"status": "error", "message": "Post not found or not eligible"}, 404)

    row = updated[0]
    return cors_response({
        "status": "ok",
        "message": "Post queued for immediate publishing. Will publish within 60 seconds.",
        "post_id": str(row['id']),
        "scheduled_for": row['scheduled_for'].isoformat() if row.get('scheduled_for') else None
    })

# ═══════════════════════════════════════════
# NEW ENDPOINT 5 — POST /api/settings
# Replaces n8n 06 update-settings webhook
# ═══════════════════════════════════════════

@app.route('/api/settings', methods=['POST', 'OPTIONS'])
def update_settings():
    body = request.get_json() or {}
    client_id = body.get('client_id', CLIENT_ID)
    daily_post_limit = body.get('daily_post_limit')
    publishing_slots = body.get('publishing_slots')

    updates = []
    params = []

    if daily_post_limit is not None:
        updates.append("limit_override_daily = %s")
        params.append(int(daily_post_limit))

    if publishing_slots is not None:
        updates.append("publishing_slots = %s")
        slots = publishing_slots if isinstance(publishing_slots, str) else json.dumps(publishing_slots)
        params.append(slots)

    if not updates:
        return cors_response({"status": "error", "message": "Nothing to update"}, 400)

    params.append(client_id)
    db_query(
        f"UPDATE clients SET {', '.join(updates)} WHERE id = %s",
        params,
        fetch=False
    )

    return cors_response({"status": "ok", "message": "Settings updated"})

# ═══════════════════════════════════════════
# NEW ENDPOINT 6 — POST /api/generate-now
# Calls n8n generate-now webhook (keeps AI in n8n)
# ═══════════════════════════════════════════

@app.route('/api/generate-now', methods=['POST', 'OPTIONS'])
def generate_now():
    body = request.get_json() or {}
    client_id = body.get('client_id', CLIENT_ID)

    payload = json.dumps({"client_id": client_id}).encode()
    req = urllib.request.Request(
        N8N_GENERATE_NOW_WEBHOOK,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return cors_response({"status": "ok", "message": "Content generation triggered"})
    except Exception as e:
        return cors_response({"status": "error", "message": str(e)}, 500)

if __name__ == '__main__':
    app.config['TIMEOUT'] = None
    app.run(host='0.0.0.0', port=5050, debug=False)