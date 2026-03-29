# ================================================================
# PostFlow Configuration — Single source of truth
# ================================================================

# Database
DB_CONFIG = {
    "host": "localhost",
    "port": 5433,
    "database": "linkedin_agent",
    "user": "hragent",
    "password": "hragent123"
}

DB_URL = "postgresql://hragent:hragent123@localhost:5433/linkedin_agent"

# App
CLIENT_ID = "hr-pro-001"
TIMEZONE = "Asia/Karachi"
ENVIRONMENT = "development"

# n8n
N8N_BASE_URL = "http://localhost:5678"
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
JWT_SECRET = "postflow-super-secret-key-change-in-production"
JWT_EXPIRY_DAYS = 30
