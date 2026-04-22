#!/usr/bin/env bash
# Production startup script for Qalam Flask API server.
# Uses Gunicorn with gevent workers for proper SSE support.
#
# Usage:
#   ./start_server.sh
#
# Requires: pip install gunicorn gevent  (already in requirements.txt)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Activate venv if present
if [ -f "venv/bin/activate" ]; then
  source venv/bin/activate
fi

# Gunicorn with gevent workers:
#   -w 1          — single worker process (gevent handles concurrency via green threads)
#   --worker-class gevent — async worker; SSE/long-poll connections don't block threads
#   --worker-connections 1000 — up to 1000 concurrent connections per worker
#   --timeout 120 — give slow DB queries / LinkedIn actions time to complete
#   --keep-alive 5 — reuse connections for up to 5s
exec gunicorn \
  -w 1 \
  --worker-class gevent \
  --worker-connections 1000 \
  --timeout 120 \
  --keep-alive 5 \
  --bind 0.0.0.0:5050 \
  --access-logfile - \
  --error-logfile - \
  action_server:app
