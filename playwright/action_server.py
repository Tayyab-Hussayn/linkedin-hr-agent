# playwright/action_server.py
import subprocess
import json
import sys
import signal
import psycopg2
from flask import Flask, request, jsonify

signal.signal(signal.SIGCHLD, signal.SIG_DFL)

app = Flask(__name__)

# Database configuration
DB_CONFIG = {
    "host": "localhost",
    "port": 5433,
    "database": "linkedin_agent",
    "user": "hragent",
    "password": "hragent123"
}

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

if __name__ == '__main__':
    app.config['TIMEOUT'] = None
    app.run(host='0.0.0.0', port=5050, debug=False)