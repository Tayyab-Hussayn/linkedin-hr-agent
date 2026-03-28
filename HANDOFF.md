# Qalam — Complete Project Handoff Document
# For AI Agent Continuation
# Last updated: March 2026

---

## 1. PROJECT OVERVIEW

**Qalam** is a LinkedIn automation SaaS system that:
- Generates LinkedIn posts using AI (Ollama/Gemini via n8n)
- Presents posts to clients for approval via a Next.js dashboard
- Publishes approved posts to LinkedIn at scheduled times via Playwright
- Supports multiple clients with tiered subscription plans

**Client:** Moeez Ahmad (HR Director) — test client `hr-pro-001`
**Developer:** Tayyab (freelance/agency developer)
**Stage:** Active development, not yet live on internet (local only)

---

## 2. TECH STACK

| Component | Technology | Port |
|-----------|-----------|------|
| Database | PostgreSQL 15 (Docker) | 5433 |
| Workflow Engine | n8n (Docker) | 5678 |
| API Server | Python Flask | 5050 |
| Browser Automation | Playwright (Python) | — |
| Dashboard | Next.js 14 (local dev) | 3000 |
| AI Model | Ollama (gemini-3-flash-preview) | 11434 |
| Tunnel | Cloudflare (NOT YET SET UP) | — |

---

## 3. FILE STRUCTURE

```
/home/krawin/exp.code/linkedin-hr-agent/
├── dashboard/                    # Next.js PWA dashboard
│   ├── src/
│   │   ├── app/
│   │   │   ├── queue/page.tsx    # Pending posts for approval
│   │   │   ├── scheduled/page.tsx # Approved + scheduled posts
│   │   │   ├── content/page.tsx  # AI generation controls
│   │   │   └── analytics/page.tsx # qanalytics
│   │   ├── components/ui/
│   │   │   └── PostCard.tsx      # Post card with approve/reject/copy/view
│   │   └── lib/
│   │       └── api.ts            # All API calls — points to Flask :5050
│   └── .env.local                # NEXT_PUBLIC_API_URL=http://localhost:5050
│                                 # NEXT_PUBLIC_N8N_URL=http://localhost:5678
│
├── playwright/
│   ├── action_server.py          # Flask API server (PORT 5050) — MAIN BACKEND
│   ├── config.py                 # Single source of truth for all config
│   ├── prompt_builder.py         # Dynamic AI prompt builder (niche system)
│   ├── queue_worker.py           # v4 — polls DB, publishes via Playwright
│   ├── linkedin_actions.py       # Playwright LinkedIn automation
│   └── profiles/
│       └── hr-pro-001/           # Persistent browser profile (LinkedIn session)
│
├── n8n-workflows/                # Exported workflow JSONs
├── manage_clients.sh             # CLI tool for client/plan management
├── config.json                   # Legacy config (mostly unused now)
└── docker-compose.yml
```

---

## 4. HOW TO START ALL SERVICES

```bash
# 1. Start Docker (PostgreSQL + n8n)
docker start la_postgres la_n8n

# 2. Start Flask API server
cd /home/krawin/exp.code/linkedin-hr-agent/playwright
source venv/bin/activate
python action_server.py &

# 3. Start Queue Worker
python queue_worker.py &

# 4. Start Dashboard
cd /home/krawin/exp.code/linkedin-hr-agent/dashboard
npm run dev &

# Verify
curl http://localhost:5050/health   # Flask
curl http://localhost:5678/healthz  # n8n
```

---

## 5. DATABASE SCHEMA

### clients table
```sql
id VARCHAR PRIMARY KEY          -- e.g. 'hr-pro-001'
name VARCHAR
email VARCHAR
linkedin_email VARCHAR
linkedin_password VARCHAR
is_active BOOLEAN DEFAULT true
timezone VARCHAR DEFAULT 'Asia/Karachi'
active_hours_start TIME
active_hours_end TIME
content_mode VARCHAR
daily_post_limit INT DEFAULT 3  -- DEPRECATED: use client_effective_limits view
publishing_slots JSONB          -- e.g. ["18:00"]
plan_id VARCHAR → plans(id)     -- subscription plan
limit_override_daily INT        -- overrides plan default if set

-- NEW profile columns (added for multi-niche system):
niche VARCHAR DEFAULT 'hr_professional'
job_title VARCHAR
tone TEXT
target_audience TEXT
writing_style TEXT
sample_posts JSONB DEFAULT '[]'
avoid_topics JSONB DEFAULT '[]'
content_language VARCHAR DEFAULT 'en'
years_experience INT DEFAULT 5
company_name VARCHAR
unique_angle TEXT
topic_pillars JSONB DEFAULT '[]'
post_formats JSONB DEFAULT '["story","insight","tips","controversial"]'
```

### posts table
```sql
id UUID PRIMARY KEY
client_id VARCHAR → clients(id)
content TEXT
topic_pillar VARCHAR
post_format VARCHAR
approval_status VARCHAR     -- pending | approved | rejected
post_status VARCHAR         -- draft | publishing | published | failed | skipped
approval_note TEXT
rejection_reason TEXT
scheduled_for TIMESTAMP WITH TIME ZONE
published_at TIMESTAMP WITH TIME ZONE
created_at TIMESTAMP WITH TIME ZONE
updated_at TIMESTAMP WITH TIME ZONE
retry_count INT DEFAULT 0
likes_count INT
comments_count INT
shares_count INT
views_count INT
```

### plans table
```sql
id VARCHAR PRIMARY KEY      -- free | starter | growth | pro | custom
name VARCHAR
description TEXT
daily_post_limit INT
monthly_post_limit INT
max_topic_pillars INT
can_schedule BOOLEAN
can_custom_time BOOLEAN
can_edit_posts BOOLEAN
can_analytics BOOLEAN
can_generate_now BOOLEAN
ai_model VARCHAR
max_post_length INT
max_publishing_slots INT
price_monthly DECIMAL
is_active BOOLEAN
```

### client_effective_limits VIEW
```sql
-- Resolves actual limits per client combining plan + overrides
-- USE THIS instead of querying clients directly for limits
SELECT client_id, plan_name, daily_post_limit, monthly_post_limit,
  can_schedule, can_custom_time, can_analytics, can_generate_now,
  ai_model, publishing_slots
FROM clients JOIN plans ...
```

### Current Plans
```
free:    2 posts/day,  no analytics, no custom time, no manual gen
starter: 3 posts/day,  analytics ON, no custom time, no manual gen  ← hr-pro-001
growth:  6 posts/day,  all features, custom time, manual gen
pro:     10 posts/day, all features
custom:  999/day,      all features
```

---

## 6. FLASK API ENDPOINTS (action_server.py — port 5050)

```
GET  /health                           Health check
POST /execute                          Run Playwright action (LinkedIn post)

GET  /api/posts?status=queue           Pending posts for approval
GET  /api/posts?status=scheduled       Approved + scheduled posts
GET  /api/posts?status=history         Published/skipped posts
GET  /api/stats                        Stats + plan info for dashboard
POST /api/approve                      Approve/reject a post
POST /api/publish-now                  Set scheduled_for=NOW() for immediate publish
POST /api/settings                     Update client settings
POST /api/generate-now                 Proxy to n8n generate-now webhook

GET  /api/client-profile/<client_id>  Get client profile + dynamic AI prompt
PUT  /api/client-profile/<client_id>  Update client profile
GET  /api/niches                       Get all available niches
```

### Key API Behaviors
- All responses include CORS headers
- All timestamps stored as UTC in DB
- All timestamps displayed in browser's local timezone
- `scheduled_for` sent from frontend with `+05:00` offset (PKT)
- `new Date(year, month-1, day, hour, min)` used for local time construction (no hardcoded offsets)

---

## 7. N8N WORKFLOWS STATUS

```
01 - NOT EXPORTED (old, replaced by 02)
02 - Daily Content Generation    ACTIVE  ← JUST UPDATED to use Flask prompt builder
03 - Post Approval Flow          INACTIVE ← MOVED TO FLASK /api/approve
04 - PWA Data API                INACTIVE ← MOVED TO FLASK /api/posts + /api/stats
05 - Analytics                   ACTIVE
06 - Manual Trigger API          ACTIVE  ← only generate-now webhook still needed
```

### Workflow 02 Flow
```
Cron (8AM + 6PM PKT) / Manual trigger
  → Fetch active clients from DB
  → Loop over each client
  → Check posts today vs daily limit
  → Decide how many to generate (morning: 2, evening: 1)
  → Fetch dynamic prompt from Flask /api/client-profile/{id}  ← NEW
  → AI generates posts (Ollama gemini-3-flash-preview)
  → Parse JSON response
  → Save to DB as pending/draft
  → Loop to next client
```

---

## 8. QUEUE WORKER (queue_worker.py v4)

```python
# Runs continuously, polls DB every 60 seconds
# Finds posts where: approval_status='approved' AND post_status='draft' 
#                    AND scheduled_for <= NOW()
# Publishes via Playwright → linkedin_actions.py
# Retry logic: fail → +10min, fail → +30min, fail → permanent failure
# Daily cleanup: runs cleanup_posts() DB function every 1440 cycles
# Timezone: Asia/Karachi (PKT UTC+5)
```

---

## 9. PROMPT BUILDER SYSTEM (prompt_builder.py)

### Available Niches
- hr_professional, digital_marketer, web_developer
- ceo_founder, consultant, sales_professional
- finance_professional, product_manager

### How It Works
```python
build_system_prompt(client_dict) → full system prompt string
build_user_prompt(topic, format) → user prompt for specific post
get_client_profile_summary(client) → clean profile dict for API
get_available_niches() → all niches with metadata
```

### n8n fetches prompt via:
```
GET http://localhost:5050/api/client-profile/hr-pro-001
Returns: { system_prompt, topic_pillars, post_formats, ... }
```

---

## 10. TIMEZONE HANDLING

**Critical — always follow this pattern:**

```
Frontend:  new Date(year, month-1, day, hour, min) → .toISOString()
           (browser local time → UTC automatically)

Backend:   PostgreSQL timezone = Asia/Karachi
           All timestamps stored as TIMESTAMP WITH TIME ZONE

Display:   new Date(utcIsoString).toLocaleTimeString()
           (browser auto-converts UTC → local timezone)

Queue Worker: Uses pytz Asia/Karachi
              Compares scheduled_for (UTC) <= NOW() (UTC)
```

---

## 11. CLIENT MANAGEMENT

```bash
# Use manage_clients.sh for all client operations
bash manage_clients.sh                              # show all
bash manage_clients.sh change_plan hr-pro-001 growth
bash manage_clients.sh set_override hr-pro-001 5
bash manage_clients.sh toggle_feature starter can_generate_now true
bash manage_clients.sh view_client hr-pro-001
bash manage_clients.sh usage_today
```

---

## 12. PENDING TASKS (in priority order)

### IMMEDIATE (next session)
1. **Import workflow 02 v2** into n8n and test generation
   - File: `/mnt/user-data/outputs/02_daily_content_generation_v2.json`
   - Delete old 02, import new one, click Execute to test

2. **Fix dashboard pages** — Tayyab wants to fix all UI bugs before moving on:
   - Queue page: view full post modal ✅ done
   - Queue page: copy button ✅ done  
   - PWA install banner: hide on desktop ✅ done
   - Other bugs Tayyab will identify

3. **systemd services** — auto-start Flask + queue worker on boot
   ```bash
   # Need to create:
   /etc/systemd/system/qalam-api.service
   /etc/systemd/system/qalam-worker.service
   ```

### NEXT PRIORITY
4. **Login/Auth system** — multi-client isolation
   - Each client logs in with email/password
   - JWT tokens
   - All API calls scoped to client_id from token
   - Currently client_id is hardcoded as 'hr-pro-001' everywhere

5. **Client Profile Editor UI** — dashboard page where client can:
   - Change niche
   - Edit topic pillars
   - Adjust tone/writing style
   - Add sample posts
   - Calls PUT /api/client-profile/{id}

6. **Cloudflare tunnel + domain setup**
   - Need a real domain (buy from Namecheap/Porkbun ~$3/year)
   - Point tunnel to Flask :5050
   - Update Vercel env: NEXT_PUBLIC_API_URL = tunnel URL

7. **Phase 6 — Engagement workflow**
   - Auto-comment on relevant posts
   - Auto-react to connections' posts
   - Already planned but not started

### KNOWN ISSUES
- `can_generate_now` needs to be enabled for starter plan:
  ```bash
  bash manage_clients.sh toggle_feature starter can_generate_now true
  ```
- n8n workflow 02 old version still imported — needs replacing with v2

---

## 13. IMPORTANT DECISIONS MADE

| Decision | Reason |
|----------|--------|
| Flask over FastAPI | Already had Flask, no new deps needed |
| Moved 03/04/06 from n8n to Flask | n8n should only do AI + cron, not REST API |
| TIMESTAMP WITH TIME ZONE in DB | Avoid timezone bugs — store UTC, display local |
| client_effective_limits VIEW | Single source of truth for plan limits |
| No hardcoded +05:00 in frontend | Use browser's native Date() for timezone handling |
| Playwright persistent profiles | Stay logged in to LinkedIn between sessions |
| Queue worker separate from Flask | Independent failure, no blocking |
| prompt_builder.py separate file | Clean separation, easy to add niches |

---

## 14. DATABASE CONNECTION

```python
DB_CONFIG = {
    "host": "localhost",
    "port": 5433,          # NOTE: 5433 not 5432 (Docker mapped)
    "database": "linkedin_agent",
    "user": "hragent",
    "password": "hragent123"
}

# Docker container name: la_postgres
# Connect directly:
docker exec -it la_postgres psql -U hragent -d linkedin_agent -p 5432
```

---

## 15. CURRENT TEST CLIENT

```
ID:       hr-pro-001
Name:     Moeez Ahmad
Role:     HR Director
Plan:     Starter (3 posts/day)
Niche:    hr_professional
Pillars:  Talent Acquisition, Company Culture, HR Technology, Leadership, Employee Retention
Slots:    18:00 PKT
LinkedIn: mmoeezahmad32@gmail.com (password changed after leak)
```

---

## 16. WHAT NOT TO BREAK

- `queue_worker.py` — runs continuously, do not modify DB schema it depends on
- `linkedin_actions.py` — fragile Playwright selectors, test carefully
- `client_effective_limits` VIEW — many queries depend on this
- DB timezone = Asia/Karachi — set at DB level, do not change
- Flask `/execute` endpoint — queue worker calls this for publishing

---

*End of handoff document*
