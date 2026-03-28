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

## PostFlow Dashboard (Next.js 14)

The project includes a production-grade Next.js 14 dashboard called **PostFlow** for managing LinkedIn content automation.

**Tech Stack:**
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui components
- lucide-react icons

**Features:**
- **Queue Page** - Review, approve, reject, and edit pending posts with animated card removal
- **Scheduled Page** - View posts scheduled for future publishing with countdown timers and publish controls
  - "Publish Now" button updates `scheduled_for` to NOW() so queue worker picks it up within 60 seconds
  - Does not re-approve already-approved posts (avoids n8n rejection errors)
- **History Page** - View all approved, rejected, and published posts
- **Content Page** - Generate posts on-demand, view scheduled posts, track daily generation limits
  - Auto-refreshes stats every 30 seconds
  - Refreshes on page visibility change
  - Uses `generated_today` from DB (counts only today's posts)
  - Daily limit synced from database (source of truth)
  - Displays current plan name and respects plan permissions
  - "Generate Now" button respects `can_generate_now` plan flag
- **Analytics Page** - Health score, stats overview, daily activity charts, pillar performance, insights
- **Settings Panel** - Configure n8n URL, posts per page, daily post limit
  - Daily limit loaded from API (database as source of truth)
  - Shows current plan info (plan name, default limit)
  - Allows override of plan's default daily limit
  - Re-fetches stats after save to confirm changes
- **Responsive Design** - Desktop sidebar navigation + mobile bottom tab bar
- **Real-time Updates** - Auto-refresh on visibility change, live stats tracking
- **Toast Notifications** - User feedback for all actions
- **Smart Schedule Picker** - Intelligent date/time selection that prevents past times and auto-adjusts dates

**How it works:**
- Client-side React application with server-side rendering
- Connects to n8n via webhook endpoints (`/webhook/get-posts`, `/webhook/post-approval`, etc.)
- Settings stored in localStorage (n8n URL, posts per page) and database (daily post limit via plans system)
- Safe API layer with robust JSON parsing and error handling
- **Plans System Integration** - All limits and permissions come from plans table in database
  - Stats API returns plan info: `plan_name`, `can_schedule`, `can_analytics`, `can_generate_now`, `ai_model`, `monthly_post_limit`
  - Daily limit can be overridden per client (stored in `limit_override_daily` column)
  - Database is source of truth, localStorage used only as cache
- Daily limit counter filters posts by `created_at` date (only counts today's posts)
- Manual reset available for testing (deletes today's posts from DB via n8n webhook)
- **Timezone-aware scheduling** - Uses browser's local timezone, stores as UTC in database
- **Smart schedule picker** - Automatically prevents past times, suggests next available slot
- **Local date construction** - No hardcoded timezone offsets, works globally

**Access:**
- Desktop: `http://localhost:3000`
- Mobile (same network): `http://192.168.100.48:3000`
- Configure n8n URL in Settings (default: `http://192.168.100.48:5678`)

**Development:**
```bash
cd dashboard
npm install
npm run dev
```

## Directory Structure

```
linkedin-hr-agent/
├── dashboard/                  # Next.js 14 PostFlow dashboard
│   ├── src/
│   │   ├── app/               # Next.js app router pages
│   │   │   ├── queue/         # Queue page (approve/reject posts)
│   │   │   ├── scheduled/     # Scheduled page (view/manage scheduled posts)
│   │   │   ├── history/       # History page (past posts)
│   │   │   ├── content/       # Content page (generate posts)
│   │   │   ├── analytics/     # Analytics page (stats & insights)
│   │   │   └── LayoutWrapper.tsx  # Main layout with settings
│   │   ├── components/
│   │   │   ├── layout/        # Sidebar, Header, MobileNav
│   │   │   └── ui/            # PostCard, Toast, Sheet, etc.
│   │   ├── lib/
│   │   │   ├── api.ts         # n8n API integration
│   │   │   ├── config.ts      # App configuration
│   │   │   ├── types.ts       # TypeScript interfaces
│   │   │   └── utils.ts       # Helper functions
│   │   └── hooks/             # React hooks (useToast)
│   ├── .env.local             # Environment variables
│   ├── next.config.ts         # Next.js configuration
│   └── package.json           # Dependencies
│
├── pwa_dashboard.html         # Legacy PWA dashboard (deprecated)
├── config.json                # All application settings
├── docker-compose.yml         # PostgreSQL + n8n only
├── .env                       # Environment variables
│
├── database/
│   └── schema.sql            # Plain SQL schema (run once)
│
├── playwright/
│   ├── action_server.py      # Flask HTTP server wrapping linkedin_actions.py
│   ├── linkedin_actions.py   # Single entry point for LinkedIn actions
│   ├── prompt_builder.py     # AI prompt templates and builder for content generation
│   ├── humanizer.py          # Delay/behavior utilities
│   └── requirements.txt      # playwright + flask
│
└── n8n-workflows/            # Exported workflow JSONs for backup
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

### Dashboard (Next.js)
```bash
cd dashboard

# Install dependencies (first time only)
npm install

# Start development server
npm run dev
# Runs on http://localhost:3000

# Build for production
npm run build

# Start production server
npm start

# Type checking
npm run type-check
```

**Dashboard Configuration:**
- Machine IP: `192.168.100.48` (configured in `.env.local`)
- n8n URL: `http://192.168.100.48:5678` (configurable in Settings)
- Desktop access: `http://localhost:3000`
- Mobile access: `http://192.168.100.48:3000`

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

# Start Flask action server (recommended for n8n integration)
python action_server.py
# Server runs on http://localhost:5050
```

**Important:** The virtual environment must be in `playwright/venv/` for n8n Execute Command nodes to work correctly.

### Playwright Action Server

The Flask action server (`action_server.py`) provides an HTTP API wrapper around `linkedin_actions.py`:

**Endpoints:**
- `POST /execute` - Execute LinkedIn actions via JSON payload
- `GET /health` - Health check endpoint

**Features:**
- No timeout limits (handles long-running browser operations)
- Request logging to stderr for debugging
- Returns structured JSON responses with status, stdout, stderr

**Example request:**
```bash
curl -X POST http://localhost:5050/execute \
  -H "Content-Type: application/json" \
  -d '{
    "action": "post",
    "content": "Hello LinkedIn!",
    "email": "user@example.com",
    "password": "password123"
  }'
```

**Why use the action server:**
- Better timeout handling (no 120s limit)
- Easier debugging with request/response logging
- Cleaner n8n integration via HTTP Request nodes
- Avoids subprocess timeout issues

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

**Option 1: Via Flask Action Server (Recommended)**

In an HTTP Request node:
- Method: POST
- URL: `http://localhost:5050/execute`
- Body:
```json
{
  "action": "post",
  "content": "{{ $json.content }}",
  "email": "{{ $json.email }}",
  "password": "{{ $json.password }}"
}
```

**Option 2: Direct Script Execution**

In an Execute Command node:
```bash
cd /home/krawin/exp.code/linkedin-hr-agent/playwright && source venv/bin/activate && python linkedin_actions.py '{"action": "post", "content": "{{ $json.content }}", "email": "{{ $json.email }}", "password": "{{ $json.password }}"}'
```

**Note:** Use absolute paths. The script creates browser profiles in `playwright/profiles/` automatically. The Flask server option is recommended for better timeout handling and debugging.

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
  - Contains `plan_id` (foreign key to plans table)
  - Contains `limit_override_daily` (optional override of plan's default daily limit)
- **plans** - Subscription plans with limits and permissions
  - `plan_name` - Plan name (e.g., "Starter", "Pro", "Enterprise")
  - `daily_post_limit` - Default daily post limit for this plan
  - `monthly_post_limit` - Monthly post limit
  - `can_schedule` - Boolean, whether scheduling is allowed
  - `can_analytics` - Boolean, whether analytics access is allowed
  - `can_generate_now` - Boolean, whether manual generation is allowed
  - `ai_model` - AI model name for this plan
- **client_profiles** - CV data, tone analysis, content strategy (JSONB)
- **posts** - Content with approval and publishing status
- **engagement_log** - Record of all LinkedIn actions

All IDs are TEXT (UUIDs as strings). Timestamps use PostgreSQL's TIMESTAMP type.

**Plans System Logic:**
- Each client has a `plan_id` linking to the plans table
- Daily limit is determined by: `client.limit_override_daily ?? plan.daily_post_limit`
- Stats API joins clients and plans tables to return all plan information
- Dashboard respects plan permissions (e.g., disables "Generate Now" if `can_generate_now = false`)

## Plans System

The application uses a flexible plans system to manage limits and permissions per client.

**Architecture:**
```
plans table (plan definitions)
  ↓ (plan_id foreign key)
clients table (client overrides)
  ↓ (stats API joins both)
Dashboard (respects limits & permissions)
```

**How It Works:**

1. **Plan Definitions** - The `plans` table defines subscription tiers:
   - Starter: 3 posts/day, basic features
   - Pro: 10 posts/day, scheduling, analytics
   - Enterprise: 20 posts/day, all features, custom AI model

2. **Client Overrides** - Each client can override their plan's daily limit:
   - `clients.limit_override_daily` overrides `plans.daily_post_limit`
   - Useful for custom agreements or temporary adjustments
   - Set via Settings panel or directly in database

3. **Stats API Integration** - The `/webhook/get-posts?status=stats` endpoint:
   - Joins `clients` and `plans` tables
   - Returns merged data: plan defaults + client overrides
   - Dashboard uses this as single source of truth

4. **Dashboard Behavior:**
   - Content page shows plan name badge (e.g., "Starter Plan")
   - "Generate Now" button disabled if `can_generate_now = false`
   - Settings panel shows current plan and allows override
   - All limits loaded from API, no hardcoded defaults

5. **n8n Workflow Requirements:**
   - Stats endpoint must join clients and plans tables
   - Must return all plan fields: `plan_name`, `can_schedule`, `can_analytics`, `can_generate_now`, `ai_model`, `monthly_post_limit`
   - Daily limit logic: `COALESCE(clients.limit_override_daily, plans.daily_post_limit)`

**Example Stats Query:**
```sql
SELECT
  COUNT(CASE WHEN approval_status = 'pending' THEN 1 END)::int as pending,
  COUNT(CASE WHEN approval_status = 'approved' AND post_status NOT IN ('published','skipped') THEN 1 END)::int as approved,
  COUNT(CASE WHEN post_status = 'published' THEN 1 END)::int as published,
  COUNT(CASE WHEN approval_status = 'rejected' THEN 1 END)::int as rejected,
  COUNT(*)::int as total,
  COUNT(CASE WHEN created_at >= CURRENT_DATE THEN 1 END)::int as generated_today
FROM posts
WHERE client_id = 'hr-pro-001';

-- Then join with clients and plans:
SELECT
  p.plan_name,
  COALESCE(c.limit_override_daily, p.daily_post_limit) as daily_post_limit,
  p.monthly_post_limit,
  p.can_schedule,
  p.can_analytics,
  p.can_generate_now,
  p.ai_model
FROM clients c
JOIN plans p ON c.plan_id = p.id
WHERE c.id = 'hr-pro-001';
```

**Benefits:**
- Centralized plan management in database
- Easy to add new plans or modify existing ones
- Per-client customization without code changes
- Dashboard automatically adapts to plan permissions
- No hardcoded limits anywhere in frontend code

## Post Scheduling System

The dashboard includes an intelligent post scheduling system with timezone-aware date/time handling.

**Key Features:**
- **Local timezone support** - Works with any timezone globally, no hardcoded offsets
- **Smart date selection** - Automatically prevents past times, suggests next available slot
- **Auto-adjusting dates** - Custom time input automatically switches between today/tomorrow based on validity
- **Real-time countdowns** - Live countdown timers showing time until publication
- **Schedule management** - View, reschedule, or publish scheduled posts immediately

**Implementation Details:**

1. **Date Construction** - Uses local Date objects instead of string parsing:
   ```javascript
   // Correct: local date construction
   const localDate = new Date(year, month - 1, day, hour, minute, 0, 0)
   const isoStr = localDate.toISOString() // Converts to UTC automatically

   // Wrong: hardcoded timezone offsets
   const isoStr = new Date(`${dateStr}T${timeStr}:00+05:00`).toISOString()
   ```

2. **Smart Slot Selection** - `getDefaultSlot()` function:
   - Checks slots: 9am, 12pm, 3pm, 6pm, 9pm
   - Returns first slot more than 2 minutes in future
   - Falls back to tomorrow 9am if all slots passed
   - Automatically called when schedule picker opens

3. **Past Time Prevention** - `isSlotPast()` function:
   - Disables time slots that have already passed today
   - Grays out past slots with reduced opacity
   - Only applies to "today" date selection

4. **Custom Time Auto-Adjustment**:
   - When user types custom time (e.g., "22:30" at 22:19)
   - System checks if time is still valid for today
   - Automatically selects "today" if valid, "tomorrow" if passed
   - Provides intelligent UX without manual date switching

5. **Timezone Display** - `formatScheduledTime()` function:
   - Receives UTC ISO string from database
   - Converts to browser's local timezone automatically
   - Uses `Intl.DateTimeFormat().resolvedOptions().timeZone`
   - Displays relative time (Today/Tomorrow) with local time

**Database Storage:**
- `scheduled_for` column stores UTC ISO strings (e.g., "2026-03-04T13:00:00.000Z")
- n8n workflow must include `scheduled_for` in SELECT queries
- Posts with `approval_status='approved'` and `post_status='draft'` and `scheduled_for IS NOT NULL` are considered scheduled

**API Endpoints:**
- `GET /webhook/get-posts?status=scheduled` - Fetch scheduled posts
- `POST /webhook/post-approval` with `scheduled_for` field - Schedule on approval
- `POST /webhook/schedule-post` - Update scheduled time
- `POST /webhook/publish-now` - Publish scheduled post immediately (updates `scheduled_for` to NOW())

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
- **Updated selectors for LinkedIn's current UI (2026-03)**:
  - "Start a post" is now a `link` element (not button), with fallbacks to button and CSS selector
  - Text editor uses shadow DOM selector (`get_by_test_id("interop-shadowdom").get_by_role("paragraph")`), with fallbacks
- **Comprehensive logging** - Every step logs `[STEP X DONE]` to stderr for debugging
- Implements stealth clipboard paste (Ctrl+V) for natural content insertion
- Handles multi-paragraph content with `Shift+Enter` for line breaks
- **Screenshot safety** - All debug screenshots have 5-second timeout and error handling
- Returns JSON status on stdout
- Stores browser profiles in `playwright/profiles/`
- **Timeout Configuration:** 60-second default timeouts for all page operations (navigation, element waits)

**Post Action Implementation:**
1. Navigate to feed with human-like scrolling and mouse movement (60s timeout)
2. Find "Start a post" element (tries link → button → CSS selector with logging)
3. Find text editor (tries shadow DOM → label → contenteditable with logging)
4. Paste content using stealth clipboard method (Ctrl+V), fallback to typing
5. Find Post button (tries exact match → partial match → CSS selector)
6. Click Post button and verify submission (15-second loop checking URL and dialog state)
7. Log `[STEP X DONE]` after each successful step for debugging

**Timeout Behavior:**
- Page-level operations: 60 seconds (navigation, default element waits)
- Specific element waits: 10-15 seconds (buttons, editors)
- No subprocess timeout when called via Flask action server
- Handles slow network conditions and LinkedIn's dynamic loading

## Prompt Builder (AI Content Generation)

The `prompt_builder.py` module provides niche-specific templates and dynamic prompt generation for AI content creation.

**Purpose:**
- Build personalized system prompts from client profiles
- Provide proven content templates for different professional niches
- Generate format-specific user prompts for post creation
- Maintain consistent voice and style across generated content

**Available Niches (8 templates):**
1. **hr_professional** - HR managers, talent acquisition, people ops
2. **digital_marketer** - Growth hackers, performance marketers, CMOs
3. **web_developer** - Software engineers, tech career content
4. **ceo_founder** - Entrepreneurs, startup leaders, executives
5. **consultant** - Business consultants, strategy advisors
6. **sales_professional** - B2B sales, SDRs, account executives
7. **finance_professional** - Financial advisors, investment strategists
8. **product_manager** - Product strategy, UX, roadmap planning

**Post Formats (6 types):**
- `story` - Personal narrative with lesson (150-250 words)
- `insight` - Industry observation with fresh perspective (100-200 words)
- `tips` - Actionable advice list (150-250 words)
- `controversial` - Contrarian take with reasoning (150-250 words)
- `lessons` - Mistakes and learnings (150-250 words)
- `list` - Value-packed numbered list (150-250 words)

**Main Functions:**

```python
from prompt_builder import (
    build_system_prompt,
    build_user_prompt,
    get_client_profile_summary,
    get_available_niches
)

# Build system prompt from client profile
system_prompt = build_system_prompt(client_dict)

# Build user prompt for specific post
user_prompt = build_user_prompt(
    topic_pillar="Talent Acquisition",
    post_format="story",
    additional_context="Focus on remote hiring challenges"
)

# Get client profile summary for API responses
profile = get_client_profile_summary(client_dict)

# Get all available niches with defaults
niches = get_available_niches()
```

**Client Profile Structure:**

```python
client = {
    "name": "John Doe",
    "niche": "hr_professional",  # Required
    "job_title": "HR Director",
    "company_name": "Acme Corp",
    "years_experience": 10,
    "tone": "Empathetic, data-informed, people-first",
    "target_audience": "HR managers, CHROs, business owners",
    "writing_style": "Story-driven with actionable insights",
    "unique_angle": "Bridges people strategy with business results",
    "topic_pillars": ["Talent Acquisition", "Culture", "HR Tech"],
    "avoid_topics": ["politics", "religion"],
    "content_language": "en"  # ISO language code
}
```

**Integration with n8n:**

In n8n workflows, use Execute Command or Code nodes to call prompt_builder:

```bash
# Option 1: Direct Python execution
cd /home/krawin/exp.code/linkedin-hr-agent/playwright && \
source venv/bin/activate && \
python -c "
import json
from prompt_builder import build_system_prompt, build_user_prompt

client = json.loads('{{ $json.client_profile }}')
system_prompt = build_system_prompt(client)
user_prompt = build_user_prompt('{{ $json.topic }}', '{{ $json.format }}')

print(json.dumps({
    'system_prompt': system_prompt,
    'user_prompt': user_prompt
}))
"
```

Then use the generated prompts in HTTP Request node to call Ollama:

```json
{
  "model": "deepseek-v3.2:cloud",
  "messages": [
    {"role": "system", "content": "{{ $json.system_prompt }}"},
    {"role": "user", "content": "{{ $json.user_prompt }}"}
  ],
  "stream": false
}
```

**Template Defaults:**

Each niche template includes sensible defaults:
- Default topic pillars (5 per niche)
- Default tone and writing style
- Default target audience
- Base prompt structure

If client profile fields are empty, the builder falls back to template defaults automatically.

**Testing:**

```bash
cd playwright
source venv/bin/activate
python prompt_builder.py
# Outputs test prompts and profile summary
```

**Important Notes:**
- All prompts enforce LinkedIn best practices (no hashtags by default, short paragraphs, strong hooks)
- Language support via `content_language` field (generates content in specified language)
- Topic pillars should be rotated to maintain content variety
- Avoid topics list prevents sensitive content generation
- System prompts are personalized with client's name, role, and experience

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
- **Flask Action Server** - Runs on port 5050, no timeout limits for long-running browser operations
- **Timeout Configuration** - 60-second defaults for page operations, no subprocess timeout in Flask server
- **Dashboard Settings** - n8n URL and posts per page stored in localStorage; daily post limit from database via plans system
- **Dashboard API** - Uses dynamic URL resolution (localStorage → env variable → default)
- **Safe JSON Parsing** - All API responses use text parsing first, never direct res.json()
- **Daily Limit Counter** - Uses `generated_today` from stats API (SQL: `COUNT(CASE WHEN created_at >= CURRENT_DATE THEN 1 END)`)
- **Stats Auto-Refresh** - Content page refreshes stats every 30 seconds and on visibility change
- **Publish Now Workflow** - Updates `scheduled_for` to NOW() instead of re-approving (avoids n8n rejection)
- **Plans System** - All limits and permissions come from plans table; clients can override via `limit_override_daily`
- **Settings Persistence** - Daily post limit from database is source of truth, localStorage is cache only
- **No Hardcoded Limits** - All default values removed; dashboard reads from API, falls back to API defaults only
- **Timezone Handling** - All scheduling uses local date construction, no hardcoded offsets, works globally
- **Smart Schedule Picker** - Automatically prevents past times, suggests next available slot, auto-adjusts dates
- **Schedule Storage** - Times stored as UTC ISO strings in database, displayed in user's local timezone
- **Playwright Logging** - Every step logs `[STEP X DONE]` to stderr for debugging
- **Playwright Selectors** - Updated for LinkedIn's 2026-03 UI (link-based "Start a post", shadow DOM editor)
- **Screenshot Safety** - All debug screenshots have 5-second timeout to prevent hanging

## Dashboard API Integration

The dashboard connects to n8n via webhook endpoints:

**GET Endpoints:**
- `/webhook/get-posts?status=pending&limit=20` - Get pending posts
- `/webhook/get-posts?status=scheduled&limit=20` - Get scheduled posts (approved, not yet published)
- `/webhook/get-posts?status=approved&limit=20` - Get approved posts
- `/webhook/get-posts?status=history&limit=50` - Get post history
- `/webhook/get-posts?status=stats` - Get stats with plan information
  - `pending`, `approved`, `published`, `rejected`, `total` - Post counts
  - `generated_today` - Count of posts created today only (uses `created_at >= CURRENT_DATE`)
  - `daily_post_limit` - Daily post limit from plans table (or client override)
  - `plan_name` - Current plan name (e.g., "Starter", "Pro", "Enterprise")
  - `can_schedule` - Boolean, whether scheduling is allowed in plan
  - `can_analytics` - Boolean, whether analytics access is allowed
  - `can_generate_now` - Boolean, whether manual generation is allowed
  - `ai_model` - AI model name for this plan
  - `monthly_post_limit` - Monthly post limit for this plan
- `/webhook/get-posts?status=pillar_stats` - Get content pillar performance
- `/webhook/get-posts?status=daily_activity&days=7` - Get daily activity data

**POST Endpoints:**
- `/webhook/post-approval` - Approve or reject a post
  ```json
  {
    "post_id": "uuid",
    "decision": "approved" | "rejected",
    "content": "optional edited content"
  }
  ```
- `/webhook/generate-now` - Trigger content generation
  ```json
  {
    "client_id": "hr-pro-001"
  }
  ```
- `/webhook/schedule-post` - Schedule a post for publishing
  ```json
  {
    "post_id": "uuid",
    "scheduled_for": "ISO 8601 timestamp"
  }
  ```
- `/webhook/publish-now` - Publish scheduled post immediately
  ```json
  {
    "post_id": "uuid"
  }
  ```
  Note: Updates `scheduled_for` to NOW() so queue worker picks it up within 60 seconds
- `/webhook/reset-daily-limit` - Reset daily post generation limit (deletes today's posts from DB)
  ```json
  {
    "client_id": "hr-pro-001"
  }
  ```
- `/webhook/update-settings` - Update client settings in database
  ```json
  {
    "client_id": "hr-pro-001",
    "daily_post_limit": 5
  }
  ```

**API Error Handling:**
- All endpoints return empty arrays/default objects on error
- No exceptions thrown to UI
- Safe JSON parsing with try/catch
- Empty response handling (returns defaults)
- Network error handling (returns defaults)

## Troubleshooting

**Dashboard not loading or showing errors:**
- Check if n8n is running: `docker-compose ps`
- Verify n8n URL in Settings matches your setup (default: `http://192.168.100.48:5678`)
- Test connection using the "Test Connection" button in Settings
- Check browser console for API errors
- Ensure `.env.local` has correct `NEXT_PUBLIC_N8N_URL`

**Dashboard shows empty data:**
- Verify n8n webhooks are configured and active
- Check n8n execution logs for errors
- Test webhook endpoints directly: `curl http://192.168.100.48:5678/webhook/get-posts?status=stats`
- Ensure PostgreSQL database has data: `docker exec la_postgres psql -U hragent -d linkedin_agent -c "SELECT COUNT(*) FROM posts;"`

**"Generated today" counter not updating:**
- Counter uses `generated_today` field from stats API (counts only today's posts via SQL `created_at >= CURRENT_DATE`)
- Counter auto-refreshes every 30 seconds
- Counter refreshes on page visibility change (switching tabs)
- Counter refreshes after "Generate Now" button click
- Daily limit comes from plans system (database is source of truth, localStorage is cache only)
- **Required n8n SQL query** for `/webhook/get-posts?status=stats`:
  ```sql
  SELECT
    COUNT(CASE WHEN approval_status = 'pending' THEN 1 END)::int as pending,
    COUNT(CASE WHEN approval_status = 'approved'
      AND post_status NOT IN ('published','skipped') THEN 1 END)::int as approved,
    COUNT(CASE WHEN post_status = 'published' THEN 1 END)::int as published,
    COUNT(CASE WHEN approval_status = 'rejected' THEN 1 END)::int as rejected,
    COUNT(*)::int as total,
    COUNT(CASE WHEN created_at >= CURRENT_DATE THEN 1 END)::int as generated_today
  FROM posts;

  -- Then join with clients and plans tables to get:
  -- daily_post_limit (from client override or plan default)
  -- plan_name, can_schedule, can_analytics, can_generate_now
  -- ai_model, monthly_post_limit
  ```

**Mobile access not working:**
- Ensure mobile device is on same network as development machine
- Use machine IP address: `http://192.168.100.48:3000`
- Check firewall settings allow port 3000
- Verify Next.js dev server is running with network access

**Settings not persisting:**
- n8n URL and posts per page are stored in browser localStorage only
- Daily post limit is stored in database via plans system (localStorage is cache only)
- Settings panel loads daily limit from API on open (calls `api.getStats()`)
- After saving, settings panel re-fetches stats to confirm changes
- Clear browser cache may reset localStorage settings (but not database values)
- Each browser/device has separate localStorage settings
- Check browser console for localStorage errors
- If daily limit not persisting, verify n8n `/webhook/update-settings` endpoint is working
- Verify plans table exists in database with proper structure

**Scheduled posts not showing or "Time not set" error:**
- Verify n8n `/webhook/get-posts?status=scheduled` endpoint returns posts with `scheduled_for` field
- Check n8n workflow SQL query includes `scheduled_for` in SELECT statement
- Ensure `scheduled_for` column exists in database: `docker exec la_postgres psql -U hragent -d linkedin_agent -c "\d posts;"`
- Test endpoint directly: `curl http://192.168.100.48:5678/webhook/get-posts?status=scheduled`
- Check browser console for API errors or missing field warnings

**Schedule picker showing wrong dates or times:**
- Schedule picker uses browser's local timezone automatically
- Times are stored as UTC in database, displayed in local timezone
- Check browser console for "buildScheduledISO" debug logs showing date construction
- Verify system clock is correct on both client and server
- Past time slots are automatically disabled (grayed out)
- Custom time input auto-adjusts date based on whether time is still valid today

**Timezone issues:**
- All scheduling uses local date construction (no hardcoded timezone offsets)
- Browser timezone is detected automatically via `Intl.DateTimeFormat().resolvedOptions().timeZone`
- Times stored as UTC ISO strings in database (e.g., "2026-03-04T13:00:00.000Z")
- Times displayed in user's local timezone when viewing scheduled posts
- Works correctly for users in any timezone globally

**n8n can't connect to Ollama:**
- Use `http://host.docker.internal:11434` (not `localhost`)

**Flask action server not responding:**
- Check if server is running: `curl http://localhost:5050/health`
- View server logs for request/response debugging (logs to stderr)
- Ensure virtual environment is activated before starting server
- Check port 5050 is not already in use: `lsof -i :5050`

**Playwright timeout issues:**
- Default timeouts increased to 60 seconds for page operations
- Flask action server has no subprocess timeout (handles long operations)
- **Comprehensive step logging** - Check stderr for `[STEP X DONE]` messages to see exactly where it stops:
  - `[STEP 1 DONE]` - Page loaded successfully
  - `[STEP 2]` - Finding "Start a post" (logs which selector worked: link/button/CSS)
  - `[STEP 2 DONE]` - Clicked "Start a post"
  - `[STEP 3]` - Finding text editor (logs which selector worked: shadow DOM/label/contenteditable)
  - `[STEP 3 DONE]` - Editor clicked
  - `[STEP 4 DONE]` - Content pasted/typed
  - `[STEP 5 DONE]` - Post button clicked
  - `[STEP 6 WAIT]` - Checking success (1-15 iterations with URL)
  - `[STEP 6 DONE]` - Verification complete with success status
- Check debug screenshots in `/tmp/debug_*.png` (5-second timeout, won't hang):
  - `debug_start_post.png` - "Start a post" element not found
  - `debug_editor.png` - Text editor not found
  - `debug_post_btn.png` - "Post" button not found
- **LinkedIn UI changes (2026-03)**: Script now handles current selectors with fallbacks
- If using direct script execution (not Flask server), increase n8n Execute Command timeout

**Playwright fails:**
- Ensure virtual environment is activated
- Check browser profiles aren't corrupted: `rm -rf playwright/profiles/*`
- Verify Chromium is installed: `playwright install chromium`

**Database connection issues:**
- Verify PostgreSQL is running: `docker-compose ps`
- Check credentials in `.env` match `config.json`

**n8n workflows not working:**
- Check execution logs in n8n UI
- Verify all nodes have correct credentials configured
- If using HTTP Request to call Flask server, ensure server is running
