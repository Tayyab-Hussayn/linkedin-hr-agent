# playwright/action_server.py
import subprocess
import json
import sys
import signal
import psycopg2
import psycopg2.extras
import urllib.request
import random
import jwt
import bcrypt
import threading
import queue as queue_module
import time
from datetime import datetime, timezone, timedelta
from flask import Flask, request, jsonify
from config import DB_CONFIG, CLIENT_ID, N8N_GENERATE_NOW_WEBHOOK, JWT_SECRET, JWT_EXPIRY_DAYS
from prompt_builder import build_system_prompt, build_user_prompt, get_client_profile_summary, get_available_niches

signal.signal(signal.SIGCHLD, signal.SIG_DFL)

app = Flask(__name__)

# SSE event broadcaster
_sse_clients: list = []
_sse_lock = threading.Lock()

def broadcast_event(event_type: str, data: dict):
    """Send event to all connected SSE clients."""
    with _sse_lock:
        dead = []
        for q in _sse_clients:
            try:
                q.put_nowait({
                    'type': event_type,
                    'data': data,
                    'timestamp': datetime.now(timezone.utc).isoformat()
                })
            except Exception:
                dead.append(q)
        for q in dead:
            _sse_clients.remove(q)

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
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response, status

# ================================================================
# AUTH HELPERS
# ================================================================

def generate_token(user_id, client_id, role):
    payload = {
        'user_id': str(user_id),
        'client_id': client_id,
        'role': role,
        'exp': datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRY_DAYS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm='HS256')

def verify_token(token):
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

def get_current_user():
    """Extract and verify JWT from request headers or query params.
    Returns decoded token payload or None."""
    # Check Authorization header first
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        token = auth_header.split(' ', 1)[1]
        return verify_token(token)

    # Fallback: check query param (for SSE connections)
    token = request.args.get('token')
    if token:
        return verify_token(token)

    return None

def get_client_id():
    """
    Get client_id from JWT token if present,
    fall back to hardcoded CLIENT_ID for compatibility.
    """
    user = get_current_user()
    if user and user.get('client_id'):
        return user['client_id']
    return CLIENT_ID

def require_auth(f):
    """Decorator to protect endpoints with JWT auth."""
    from functools import wraps
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user()
        if not user:
            return cors_response({
                "status": "error",
                "message": "Unauthorized — valid token required"
            }, 401)
        request.current_user = user
        return f(*args, **kwargs)
    return decorated

@app.before_request
def handle_options():
    """Handle OPTIONS preflight requests"""
    if request.method == 'OPTIONS':
        response = jsonify({})
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        return response, 200

# ================================================================
# AUTH ENDPOINTS
# ================================================================

@app.route('/auth/register', methods=['POST', 'OPTIONS'])
def register():
    body = request.get_json() or {}
    email = body.get('email', '').strip().lower()
    password = body.get('password', '')
    name = body.get('name', '').strip()
    niche = body.get('niche', 'hr_professional')

    if not email or not password or not name:
        return cors_response({
            "status": "error",
            "message": "name, email and password are required"
        }, 400)

    if len(password) < 8:
        return cors_response({
            "status": "error",
            "message": "Password must be at least 8 characters"
        }, 400)

    # Check if email already exists
    existing = db_query(
        "SELECT id FROM users WHERE email = %s",
        [email]
    )
    if existing:
        return cors_response({
            "status": "error",
            "message": "Email already registered"
        }, 409)

    # Hash password
    password_hash = bcrypt.hashpw(
        password.encode('utf-8'),
        bcrypt.gensalt()
    ).decode('utf-8')

    # Create client record
    client_id = f"client-{email.split('@')[0]}-{int(datetime.now().timestamp())}"
    db_query("""
        INSERT INTO clients (id, name, niche, plan_id, publishing_slots, is_active)
        VALUES (%s, %s, %s, 'free', '["18:00"]', true)
    """, [client_id, name, niche], fetch=False)

    # Create user record
    users = db_query("""
        INSERT INTO users (email, password_hash, client_id, role)
        VALUES (%s, %s, %s, 'client')
        RETURNING id, client_id, role
    """, [email, password_hash, client_id])

    user = users[0]
    token = generate_token(user['id'], user['client_id'], user['role'])

    return cors_response({
        "status": "ok",
        "message": "Account created successfully",
        "token": token,
        "client_id": client_id,
        "name": name
    }, 201)

@app.route('/auth/login', methods=['POST', 'OPTIONS'])
def login():
    body = request.get_json() or {}
    email = body.get('email', '').strip().lower()
    password = body.get('password', '')

    if not email or not password:
        return cors_response({
            "status": "error",
            "message": "email and password are required"
        }, 400)

    # Fetch user
    users = db_query("""
        SELECT u.id, u.email, u.password_hash, u.client_id,
               u.role, u.is_active, c.name
        FROM users u
        JOIN clients c ON c.id = u.client_id
        WHERE u.email = %s
    """, [email])

    if not users:
        return cors_response({
            "status": "error",
            "message": "Invalid email or password"
        }, 401)

    user = users[0]

    if not user['is_active']:
        return cors_response({
            "status": "error",
            "message": "Account is deactivated"
        }, 403)

    # Verify password
    if not bcrypt.checkpw(
        password.encode('utf-8'),
        user['password_hash'].encode('utf-8')
    ):
        return cors_response({
            "status": "error",
            "message": "Invalid email or password"
        }, 401)

    # Update last login
    db_query(
        "UPDATE users SET last_login = NOW() WHERE id = %s",
        [user['id']], fetch=False
    )

    token = generate_token(user['id'], user['client_id'], user['role'])

    return cors_response({
        "status": "ok",
        "token": token,
        "client_id": user['client_id'],
        "name": user['name'],
        "role": user['role']
    })

@app.route('/auth/me', methods=['GET', 'OPTIONS'])
@require_auth
def get_me():
    user = request.current_user
    users = db_query("""
        SELECT u.email, u.role, u.last_login,
               c.name, c.niche, c.plan_id,
               cel.plan_name, cel.daily_post_limit,
               cel.can_analytics, cel.can_generate_now
        FROM users u
        JOIN clients c ON c.id = u.client_id
        JOIN client_effective_limits cel ON cel.client_id = u.client_id
        WHERE u.client_id = %s
    """, [user['client_id']])

    if not users:
        return cors_response({"status": "error", "message": "User not found"}, 404)

    data = users[0]
    if data.get('last_login'):
        data['last_login'] = data['last_login'].isoformat()

    return cors_response({"status": "ok", "user": data})

@app.route('/auth/change-password', methods=['POST', 'OPTIONS'])
@require_auth
def change_password():
    user = request.current_user
    body = request.get_json() or {}
    current_password = body.get('current_password', '')
    new_password = body.get('new_password', '')

    if not current_password or not new_password:
        return cors_response({
            "status": "error",
            "message": "current_password and new_password required"
        }, 400)

    if len(new_password) < 8:
        return cors_response({
            "status": "error",
            "message": "New password must be at least 8 characters"
        }, 400)

    users = db_query(
        "SELECT password_hash FROM users WHERE client_id = %s",
        [user['client_id']]
    )

    if not users or not bcrypt.checkpw(
        current_password.encode('utf-8'),
        users[0]['password_hash'].encode('utf-8')
    ):
        return cors_response({
            "status": "error",
            "message": "Current password is incorrect"
        }, 401)

    new_hash = bcrypt.hashpw(
        new_password.encode('utf-8'),
        bcrypt.gensalt()
    ).decode('utf-8')

    db_query(
        "UPDATE users SET password_hash = %s WHERE client_id = %s",
        [new_hash, user['client_id']], fetch=False
    )

    return cors_response({"status": "ok", "message": "Password updated successfully"})

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

@app.route('/api/events', methods=['GET', 'OPTIONS'])
def sse_stream():
    """Server-Sent Events endpoint for real-time updates."""
    if request.method == 'OPTIONS':
        response = jsonify({})
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        return response, 200

    client_id = get_client_id()
    client_queue = queue_module.Queue()

    with _sse_lock:
        _sse_clients.append(client_queue)

    def generate():
        # Send initial connection event
        yield f"data: {json.dumps({'type': 'connected', 'client_id': client_id})}\n\n"

        while True:
            try:
                # Wait for event with 25s timeout (keep-alive)
                event = client_queue.get(timeout=25)
                yield f"data: {json.dumps(event)}\n\n"
            except queue_module.Empty:
                # Send keep-alive ping
                yield f"data: {json.dumps({'type': 'ping'})}\n\n"
            except GeneratorExit:
                break

        with _sse_lock:
            try:
                _sse_clients.remove(client_queue)
            except ValueError:
                pass

    response = app.response_class(
        generate(),
        mimetype='text/event-stream'
    )
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['X-Accel-Buffering'] = 'no'
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response

# ═══════════════════════════════════════════
# NEW ENDPOINT 1 — GET /api/posts
# Replaces n8n 04 get-posts webhook
# ═══════════════════════════════════════════

@app.route('/api/posts', methods=['GET', 'OPTIONS'])
def get_posts():
    status = request.args.get('status', 'queue')
    client_id = request.args.get('client_id') or get_client_id()
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
    cid = client_id or get_client_id()
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
        FROM client_effective_limits cel
        LEFT JOIN posts p ON p.client_id = cel.client_id
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
    client_id = request.args.get('client_id') or get_client_id()
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
            scheduled_for = compute_next_slot(post.get('client_id') or get_client_id())

        db_query("""
            UPDATE posts SET
                approval_status = 'approved',
                post_status = 'draft',
                content = %s,
                scheduled_for = %s,
                approved_at = NOW()
            WHERE id = %s
        """, [final_content, scheduled_for, post_id], fetch=False)

        # Broadcast to all connected clients
        broadcast_event('post_approved', {
            'post_id': post_id,
            'scheduled_for': scheduled_for
        })

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

        # Broadcast to all connected clients
        broadcast_event('post_rejected', {
            'post_id': post_id
        })

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

    # Broadcast to all connected clients
    broadcast_event('publish_now', {
        'post_id': post_id
    })

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
    client_id = body.get('client_id') or get_client_id()
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
    client_id = body.get('client_id') or get_client_id()

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

# ═══════════════════════════════════════════
# NEW ENDPOINT 7 — GET /api/client-profile/<client_id>
# Returns full client profile with dynamic prompts
# ═══════════════════════════════════════════

@app.route('/api/client-profile/<client_id>', methods=['GET', 'OPTIONS'])
def get_client_profile(client_id):
    rows = db_query("""
        SELECT
            c.*,
            cel.daily_post_limit,
            cel.plan_name,
            cel.can_generate_now,
            cel.monthly_post_limit
        FROM clients c
        JOIN client_effective_limits cel ON cel.client_id = c.id
        WHERE c.id = %s
    """, [client_id])

    if not rows:
        return cors_response({"status": "error", "message": "Client not found"}, 404)

    client = rows[0]

    # Parse JSONB fields
    import json as json_module
    for field in ['topic_pillars', 'post_formats', 'sample_posts', 'avoid_topics', 'publishing_slots']:
        val = client.get(field)
        if isinstance(val, str):
            try:
                client[field] = json_module.loads(val)
            except:
                client[field] = []

    # Build dynamic prompts
    system_prompt = build_system_prompt(client)
    profile_summary = get_client_profile_summary(client)

    # Get topic pillars and post formats
    from prompt_builder import NICHE_TEMPLATES, FORMAT_INSTRUCTIONS
    niche = client.get('niche', 'hr_professional')
    template = NICHE_TEMPLATES.get(niche, NICHE_TEMPLATES['hr_professional'])
    pillars = client.get('topic_pillars') or template['default_pillars']
    formats = client.get('post_formats') or ['story', 'insight', 'tips']

    return cors_response({
        "status": "ok",
        "client_id": client_id,
        "name": client.get('name'),
        "system_prompt": system_prompt,
        "topic_pillars": pillars,
        "post_formats": formats,
        "profile_summary": profile_summary,
        "daily_post_limit": client.get('daily_post_limit', 3),
        "plan_name": client.get('plan_name', 'starter')
    })

# ═══════════════════════════════════════════
# NEW ENDPOINT 8 — GET /api/niches
# Returns all available niches
# ═══════════════════════════════════════════

@app.route('/api/niches', methods=['GET', 'OPTIONS'])
def get_niches():
    return cors_response({
        "status": "ok",
        "niches": get_available_niches()
    })

# ═══════════════════════════════════════════
# NEW ENDPOINT 9 — PUT /api/client-profile/<client_id>
# Update client profile
# ═══════════════════════════════════════════

@app.route('/api/client-profile/<client_id>', methods=['PUT', 'OPTIONS'])
def update_client_profile(client_id):
    import json as json_module
    body = request.get_json() or {}

    allowed_fields = [
        'niche', 'job_title', 'tone', 'target_audience',
        'writing_style', 'sample_posts', 'avoid_topics',
        'content_language', 'years_experience', 'company_name',
        'unique_angle', 'topic_pillars', 'post_formats',
        'linkedin_email', 'linkedin_password',
        'publishing_slots'
    ]

    updates = []
    params = []

    for field in allowed_fields:
        if field in body:
            updates.append(f"{field} = %s")
            val = body[field]
            if isinstance(val, (list, dict)):
                val = json_module.dumps(val)
            params.append(val)

    if not updates:
        return cors_response({"status": "error", "message": "No valid fields to update"}, 400)

    params.append(client_id)
    db_query(
        f"UPDATE clients SET {', '.join(updates)} WHERE id = %s",
        params,
        fetch=False
    )

    # Return updated profile
    return get_client_profile(client_id)

# ═══════════════════════════════════════════
# NEW ENDPOINT 10 — POST /api/notify
# Called by n8n after content generation to notify clients
# ═══════════════════════════════════════════

@app.route('/api/notify', methods=['POST', 'OPTIONS'])
def notify_clients():
    """Called by n8n after content generation to notify clients."""
    body = request.get_json() or {}
    event_type = body.get('event', 'new_posts')
    client_id = body.get('client_id', CLIENT_ID)
    count = body.get('count', 1)

    broadcast_event(event_type, {
        'client_id': client_id,
        'count': count,
        'message': f'{count} new post(s) ready for review'
    })
    return cors_response({'status': 'ok'})

# ================================================================
# WORKER ENDPOINTS — Called by queue_worker_v5.py
# These replace direct DB access in the worker
# ================================================================

@app.route('/api/worker/due-posts', methods=['GET', 'OPTIONS'])
def worker_get_due_posts():
    """Get posts due for publishing right now."""
    rows = db_query("""
        SELECT
            p.id,
            p.client_id,
            p.content,
            p.post_format,
            p.topic_pillar,
            p.scheduled_for AT TIME ZONE 'Asia/Karachi' as scheduled_for_local,
            p.scheduled_for,
            COALESCE(p.retry_count, 0) as retry_count,
            c.linkedin_email,
            c.linkedin_password,
            c.name as client_name
        FROM posts p
        JOIN clients c ON c.id = p.client_id
        WHERE
            p.approval_status = 'approved'
            AND p.post_status = 'draft'
            AND p.scheduled_for IS NOT NULL
            AND p.scheduled_for <= NOW()
            AND COALESCE(p.retry_count, 0) < %s
        ORDER BY p.scheduled_for ASC
        LIMIT 5
    """, [3])

    for row in rows:
        for key in ['scheduled_for', 'scheduled_for_local']:
            if row.get(key):
                row[key] = str(row[key])

    return cors_response({'status': 'ok', 'posts': rows})


@app.route('/api/worker/upcoming-posts', methods=['GET', 'OPTIONS'])
def worker_get_upcoming_posts():
    """Get upcoming scheduled posts for display on startup."""
    rows = db_query("""
        SELECT
            p.id,
            p.topic_pillar,
            p.scheduled_for AT TIME ZONE 'Asia/Karachi' as scheduled_local,
            COALESCE(p.retry_count, 0) as retry_count,
            c.name as client_name
        FROM posts p
        JOIN clients c ON c.id = p.client_id
        WHERE
            p.approval_status = 'approved'
            AND p.post_status = 'draft'
            AND p.scheduled_for IS NOT NULL
            AND p.scheduled_for > NOW()
        ORDER BY p.scheduled_for ASC
        LIMIT 10
    """)

    for row in rows:
        if row.get('scheduled_local'):
            row['scheduled_local'] = str(row['scheduled_local'])

    return cors_response({'status': 'ok', 'posts': rows})


@app.route('/api/worker/mark-publishing', methods=['POST', 'OPTIONS'])
def worker_mark_publishing():
    """Atomically lock a post for publishing."""
    body = request.get_json() or {}
    post_id = body.get('post_id')
    if not post_id:
        return cors_response({'status': 'error', 'message': 'post_id required'}, 400)

    rows = db_query("""
        UPDATE posts
        SET post_status = 'publishing'
        WHERE id = %s
            AND post_status = 'draft'
            AND approval_status = 'approved'
        RETURNING id
    """, [post_id])

    return cors_response({'status': 'ok', 'locked': len(rows) > 0})


@app.route('/api/worker/mark-published', methods=['POST', 'OPTIONS'])
def worker_mark_published():
    """Mark a post as successfully published."""
    body = request.get_json() or {}
    post_id = body.get('post_id')
    if not post_id:
        return cors_response({'status': 'error', 'message': 'post_id required'}, 400)

    db_query("""
        UPDATE posts
        SET post_status = 'published',
            published_at = NOW()
        WHERE id = %s
    """, [post_id], fetch=False)

    # Broadcast SSE event
    broadcast_event('post_published', {'post_id': post_id})

    return cors_response({'status': 'ok'})


@app.route('/api/worker/mark-failed', methods=['POST', 'OPTIONS'])
def worker_mark_failed():
    """Mark a post as failed and schedule retry."""
    body = request.get_json() or {}
    post_id = body.get('post_id')
    retry_count = body.get('retry_count', 0)

    if not post_id:
        return cors_response({'status': 'error', 'message': 'post_id required'}, 400)

    next_retry = retry_count + 1
    backoff_minutes = [10, 30, 60]

    if next_retry >= 3:
        # Permanent failure
        db_query("""
            UPDATE posts SET
                post_status = 'failed',
                retry_count = %s
            WHERE id = %s
        """, [next_retry, post_id], fetch=False)
    else:
        # Schedule retry with backoff
        delay = backoff_minutes[min(retry_count, len(backoff_minutes) - 1)]
        db_query(f"""
            UPDATE posts SET
                post_status = 'draft',
                retry_count = %s,
                scheduled_for = NOW() + INTERVAL '{delay} minutes'
            WHERE id = %s
        """, [next_retry, post_id], fetch=False)

    return cors_response({'status': 'ok'})


@app.route('/api/worker/cleanup', methods=['POST', 'OPTIONS'])
def worker_cleanup():
    """Run cleanup of old/stale posts."""
    try:
        db_query("SELECT cleanup_posts()", fetch=False)
        return cors_response({'status': 'ok'})
    except Exception as e:
        return cors_response({'status': 'error', 'message': str(e)}, 500)


if __name__ == '__main__':
    app.config['TIMEOUT'] = None
    app.run(host='0.0.0.0', port=5050, debug=False, threaded=True)