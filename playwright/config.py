# ================================================================
# Qalam Configuration — Single source of truth
# ================================================================

import os

# Database
DB_CONFIG = {
    "host": os.environ.get('DB_HOST', 'localhost'),
    "port": int(os.environ.get('DB_PORT', '5433')),
    "database": os.environ.get('DB_NAME', 'linkedin_agent'),
    "user": os.environ.get('DB_USER', 'hragent'),
    "password": os.environ.get('DB_PASSWORD', 'hragent123')
}

DB_URL = "postgresql://{user}:{password}@{host}:{port}/{database}".format(**DB_CONFIG)

# App
TIMEZONE = "Asia/Karachi"

# n8n — URL must be set via N8N_BASE_URL env var in production
N8N_BASE_URL = os.environ.get('N8N_BASE_URL', 'http://localhost:5678')
N8N_GENERATE_NOW_WEBHOOK = f"{N8N_BASE_URL}/webhook/generate-now"
N8N_APPROVAL_WEBHOOK = f"{N8N_BASE_URL}/webhook/post-approval"

# Server
API_PORT = 5050
API_HOST = "0.0.0.0"

# Queue worker
QUEUE_POLL_INTERVAL = 60
QUEUE_MAX_RETRIES = 3
QUEUE_RETRY_DELAYS = [10, 30]  # minutes

# Publishing
DEFAULT_PUBLISHING_SLOTS = ["18:00"]

# Auth
JWT_SECRET = os.environ.get('JWT_SECRET', 'qalam-dev-secret-change-in-production')
JWT_EXPIRY_DAYS = 30

if JWT_SECRET == 'qalam-dev-secret-change-in-production':
    import sys
    print("[WARNING] JWT_SECRET is using default dev value. Set JWT_SECRET env var in production.", file=sys.stderr)
