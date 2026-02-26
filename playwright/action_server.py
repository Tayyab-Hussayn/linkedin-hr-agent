# playwright/action_server.py
import subprocess
import json
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/execute', methods=['POST'])
def execute():
    try:
        payload = request.get_json()
        if not payload:
            return jsonify({"status": "error", "message": "No JSON payload"}), 400

        # Run linkedin_actions.py with the payload
        result = subprocess.run(
            ['python', 'linkedin_actions.py', json.dumps(payload)],
            capture_output=True,
            text=True,
            timeout=120,
            cwd='/home/krawin/exp.code/linkedin-hr-agent/playwright'
        )

        # Parse last line of stdout as JSON result
        stdout_lines = result.stdout.strip().split('\n')
        last_line = stdout_lines[-1] if stdout_lines else ''

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

    except subprocess.TimeoutExpired:
        return jsonify({"status": "error", "message": "Action timed out after 120 seconds"}), 504
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "f**king ok", "service": "playwright-action-server"})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5050, debug=False)