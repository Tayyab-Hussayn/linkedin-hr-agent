# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LinkedIn HR Agent is a no-code LinkedIn automation system built on n8n. The architecture is intentionally minimal: n8n orchestrates everything, Playwright handles browser automation, and PostgreSQL stores data.

**Architecture Philosophy:** n8n does everything it can. Code only where n8n physically cannot.

## Stack

```
Slack (user interface)
  ↓
n8n (orchestration + logic + DB + AI calls)
  ↓
Playwright Script (LinkedIn browser actions only)
  ↓
LinkedIn
```

**What's in the stack:**
- **n8n** - Workflow automation, orchestration, AI calls, database operations, Slack integration
- **PostgreSQL** - Data storage (accessed via n8n's Postgres node with plain SQL)
- **Playwright** - Single Python script for LinkedIn browser automation
- **Ollama** - Local AI (called directly by n8n via HTTP Request nodes)
- **config.json** - Single configuration file

**What's NOT in the stack:**
- ❌ FastAPI backend
- ❌ SQLAlchemy/Alembic
- ❌ Redis
- ❌ Python intelligence services

## Directory Structure

```
linkedin-hr-agent/
├── config.json              # All application settings
├── docker-compose.yml       # PostgreSQL + n8n only
├── .env                     # Environment variables
│
├── database/
│   └── schema.sql          # Plain SQL schema (run once)
│
├── playwright/
│   ├── linkedin_actions.py # Single entry point for LinkedIn actions
│   ├── humanizer.py        # Delay/behavior utilities
│   └── requirements.txt    # playwright only
│
└── n8n-workflows/          # Exported workflow JSONs for backup
    ├── cv_onboarding.json
    ├── daily_content.json
    ├── engagement.json
    └── approval_flow.json
```

## Development Commands

### Start Services
```bash
# Start PostgreSQL and n8n
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f n8n
docker-compose logs -f postgres
```

### Database Operations
```bash
# Initialize database schema (run once)
docker exec -i la_postgres psql -U hragent -d linkedin_agent < database/schema.sql

# Connect to database
docker exec -it la_postgres psql -U hragent -d linkedin_agent

# View tables
docker exec la_postgres psql -U hragent -d linkedin_agent -c "\dt"

# Run custom SQL
docker exec la_postgres psql -U hragent -d linkedin_agent -c "SELECT * FROM clients;"
```

### Playwright Setup
```bash
cd playwright

# Create virtual environment (if not exists)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
playwright install chromium

# Test LinkedIn action (dry run)
python linkedin_actions.py '{"action": "post", "content": "Test post", "email": "your@email.com", "password": "yourpass"}'
```

**Important:** The virtual environment must be in `playwright/venv/` for n8n Execute Command nodes to work correctly.

### Access n8n
```bash
# n8n web interface
http://localhost:5678

# First time setup: create an account in the n8n UI
```

## Working with n8n

### Creating Workflows

n8n workflows handle all business logic:
1. **CV Onboarding** - Parse CV, analyze tone, create client profile
2. **Daily Content** - Generate posts based on strategy, send for approval
3. **Engagement** - React to posts, comment on relevant content
4. **Approval Flow** - Handle Slack approvals, schedule posts

### n8n Node Types Used

- **Slack Trigger** - Listen for user commands
- **Postgres** - Read/write database with plain SQL
- **HTTP Request** - Call Ollama for AI completions
- **Execute Command** - Run Playwright script
- **Webhook** - Receive approval responses
- **Schedule Trigger** - Daily content generation
- **Code** - JavaScript for data transformation

### Example: Calling Playwright from n8n

In an Execute Command node:
```bash
cd /home/krawin/exp.code/linkedin-hr-agent/playwright && source venv/bin/activate && python linkedin_actions.py '{"action": "post", "content": "{{ $json.content }}", "email": "{{ $json.email }}", "password": "{{ $json.password }}"}'
```

**Note:** Use absolute paths. The script creates browser profiles in `playwright/profiles/` automatically.

### Example: Calling Ollama from n8n

In an HTTP Request node:
- Method: POST
- URL: `http://host.docker.internal:11434/api/chat`
- Body:
```json
{
  "model": "deepseek-v3.2:cloud",
  "messages": [
    {"role": "system", "content": "You are a professional content writer."},
    {"role": "user", "content": "{{ $json.prompt }}"}
  ],
  "stream": false
}
```

## Database Schema

The database uses plain SQL with JSONB for flexible data storage. Key tables:

- **clients** - LinkedIn accounts being managed
- **client_profiles** - CV data, tone analysis, content strategy (JSONB)
- **posts** - Content with approval and publishing status
- **engagement_log** - Record of all LinkedIn actions

All IDs are TEXT (UUIDs as strings). Timestamps use PostgreSQL's TIMESTAMP type.

## Playwright Script

The `linkedin_actions.py` script accepts JSON arguments and performs LinkedIn actions:

**Actions:**
- `post` - Create a LinkedIn post
- `comment` - Comment on a post
- `react` - React to a post (like, celebrate, etc.)

**Example:**
```bash
python linkedin_actions.py '{
  "action": "post",
  "content": "Excited to share...",
  "email": "user@example.com",
  "password": "password123"
}'
```

The script:
- Uses persistent browser contexts (saves login state)
- Implements human-like delays and typing
- Returns JSON status on stdout
- Stores browser profiles in `playwright/profiles/`

## Configuration

All settings are in `config.json`:
- AI provider settings (Ollama)
- Client settings (timezone, active hours)
- Content strategy (posts per day, topics)
- Behavior settings (delays, typing speed)

**Important:** Sensitive values in `.env` override `config.json`:
- `POSTGRES_USER=hragent` (overrides database URL username)
- `POSTGRES_PASSWORD`
- `POSTGRES_DB=linkedin_agent`
- `N8N_ENCRYPTION_KEY`

**Legacy fields in config.json (unused):**
- `redis` - Redis is no longer used
- `dashboard.backend_url` - No backend API exists
- Database URL in config.json uses old username; `.env` takes precedence

## Important Notes

- **No ORM** - All database operations use plain SQL in n8n Postgres nodes
- **No migrations** - Schema is created once with `schema.sql`
- **No backend API** - n8n handles all orchestration
- **Stateless Playwright** - Each execution is independent, called by n8n
- **PostgreSQL port** - Runs on 5433 (not 5432) to avoid conflicts with local PostgreSQL
- **PostgreSQL username** - Use `hragent` (not the Cyrillic characters in old config.json)
- **Browser profiles** - Stored in `playwright/profiles/` to persist login sessions
- **Virtual environment** - Must be `playwright/venv/` (not `.venv`) for consistency

## Troubleshooting

**n8n can't connect to Ollama:**
- Use `http://host.docker.internal:11434` (not `localhost`)

**Playwright fails:**
- Ensure virtual environment is activated
- Check browser profiles aren't corrupted: `rm -rf playwright/profiles/*`

**Database connection issues:**
- Verify PostgreSQL is running: `docker-compose ps`
- Check credentials in `.env` match `config.json`

**n8n workflows not working:**
- Check execution logs in n8n UI
- Verify all nodes have correct credentials configured
