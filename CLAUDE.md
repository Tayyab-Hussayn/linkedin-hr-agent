# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

**Qalam** — LinkedIn content automation SaaS. Users connect their LinkedIn account, AI generates posts, users approve/schedule via dashboard, and posts are published automatically.

**Brand:** Qalam (formerly PostFlow). All user-facing references use "Qalam".

## Architecture

```
Tauri Desktop App (Rust shell)
  ├── embeds: Qalam Dashboard (Next.js 14 static export)
  ├── bundles: qalam-worker sidecar (PyInstaller binary)
  └── launches worker on startup with QALAM_API_URL + QALAM_TIMEZONE env vars

Qalam Dashboard (Next.js 14)
  ↓ (REST API + SSE)
Flask API Server (action_server.py, port 5050)
  ↓ (psycopg2)
PostgreSQL (Docker, port 5433)
  ↓ (subprocess)
Playwright (linkedin_actions.py → LinkedIn)

Queue Worker v5 (queue_worker_v5.py / qalam-worker binary)
  ↓ (HTTP to Flask API)
Flask API Server
```

**Key principle:** Flask API is the single gateway to the database. No direct DB access from dashboard or queue worker.

### What's in the stack:
- **Tauri 2** (`src-tauri/`) — Rust desktop shell, bundles dashboard + worker as installable app
- **Next.js 14 dashboard** — App Router, TypeScript, Tailwind CSS, dark theme
- **Flask API** (`action_server.py`) — All DB operations, auth, SSE events, worker endpoints
- **PostgreSQL** — Data storage (Docker container `la_postgres`, port 5433)
- **Playwright** — Browser automation for LinkedIn posting
- **Queue Worker v5** — Polls Flask API for due posts, runs Playwright to publish (also bundled as `qalam-worker` sidecar)
- **n8n** — AI content generation only (called via webhook from Flask)
- **Ollama** — Local AI model for content generation

### What's NOT in the stack:
- ❌ Direct DB access from frontend (uses Flask API)
- ❌ SQLAlchemy/Alembic (plain SQL only)
- ❌ Redis
- ❌ pg package in frontend (removed)

## Directory Structure

```
linkedin-hr-agent/
├── dashboard/                  # Next.js 14 Qalam dashboard
│   ├── src/
│   │   ├── app/               # Next.js app router pages
│   │   │   ├── queue/         # Review & approve pending posts
│   │   │   ├── scheduled/     # View/manage scheduled posts
│   │   │   ├── content/       # Generate posts, view limits
│   │   │   ├── analytics/     # Stats, charts, post history
│   │   │   ├── settings/      # Account, content profile, API config
│   │   │   ├── login/         # JWT login
│   │   │   ├── register/      # New account registration
│   │   │   ├── onboarding/    # Niche/pillar setup wizard
│   │   │   └── LayoutWrapper.tsx  # Main layout, SSE, toast container
│   │   ├── components/
│   │   │   ├── layout/        # Sidebar, Header, MobileNav
│   │   │   └── ui/            # PostCard, Toast, Sheet, SkeletonCard, etc.
│   │   ├── context/
│   │   │   └── AppContext.tsx  # Shared state: toasts, scheduled count, pulse
│   │   ├── hooks/
│   │   │   ├── useToast.ts    # Legacy (toast now in AppContext)
│   │   │   └── useSSE.ts      # Server-Sent Events hook
│   │   └── lib/
│   │       ├── api.ts         # Flask API client (apiFetch with 401 handling)
│   │       ├── auth.ts        # JWT auth helpers
│   │       ├── config.ts      # App configuration
│   │       ├── types.ts       # TypeScript interfaces
│   │       └── utils.ts       # Helper functions
│   ├── .env.local             # NEXT_PUBLIC_API_URL, NEXT_PUBLIC_N8N_URL
│   └── package.json
│
├── playwright/
│   ├── action_server.py       # Flask API server (ALL endpoints)
│   ├── config.py              # DB_CONFIG, CLIENT_ID, JWT_SECRET
│   ├── linkedin_actions.py    # LinkedIn browser automation
│   ├── queue_worker_v5.py     # Scheduled post publisher (uses Flask API)
│   ├── queue_worker.py        # Legacy v4 (direct DB, deprecated)
│   ├── prompt_builder.py      # AI prompt templates per niche
│   ├── humanizer.py           # Delay/behavior utilities
│   └── requirements.txt       # playwright, flask, requests, psycopg2, etc.
│
├── database/
│   └── schema.sql             # Full schema (run once)
│
├── src-tauri/
│   ├── src/lib.rs             # Tauri app entry — launches qalam-worker sidecar on startup
│   ├── Cargo.toml             # Rust deps: tauri, tauri-plugin-shell, tauri-plugin-log
│   ├── tauri.conf.json        # App config: frontendDist, externalBin, bundle targets (deb, rpm)
│   ├── binaries/              # Sidecar binaries (qalam-worker-{target-triple})
│   └── capabilities/default.json  # Permissions: core:default, shell:allow-execute/spawn
│
├── docker-compose.yml         # PostgreSQL + n8n
├── config.json                # Legacy settings (mostly unused)
└── .env                       # POSTGRES_USER, POSTGRES_PASSWORD, etc.
```

## Development Commands

### Start Services
```bash
# Start PostgreSQL and n8n
docker-compose up -d

# Start Flask API server
cd playwright && source venv/bin/activate && python action_server.py
# Runs on http://localhost:5050

# Start dashboard
cd dashboard && npm run dev
# Runs on http://localhost:3000

# Start queue worker (publishes scheduled posts)
cd playwright && source venv/bin/activate && python queue_worker_v5.py
```

### Dashboard
```bash
cd dashboard
npm install      # First time only
npm run dev      # Development server
npm run build    # Production build (catches TypeScript errors)
```

### Tauri Desktop App
```bash
# Build release (deb + rpm)
cargo tauri build

# Build debug (faster, no optimization)
cargo tauri build --debug

# Dev mode (hot-reload dashboard + Rust)
cargo tauri dev

# Rebuild worker sidecar (from playwright/)
cd playwright && source venv/bin/activate && pyinstaller --onefile --name qalam-worker queue_worker_v5.py
TARGET=$(rustc -vV | grep host | awk '{print $2}')
cp dist/qalam-worker ../src-tauri/binaries/qalam-worker-$TARGET
```

All Tauri commands run from project root (not `dashboard/` or `src-tauri/`).

### Database
```bash
# Connect to database
docker exec -it la_postgres psql -U hragent -d linkedin_agent

# Initialize schema
docker exec -i la_postgres psql -U hragent -d linkedin_agent < database/schema.sql

# Quick status check
docker exec la_postgres psql -U hragent -d linkedin_agent -c "
SELECT approval_status, post_status, COUNT(*) FROM posts GROUP BY 1,2 ORDER BY 1,2;"
```

## Flask API Server (action_server.py)

The Flask server is the **single API gateway**. All DB access goes through it.

### Auth Endpoints (no JWT required)
- `POST /auth/register` — Create account (returns JWT token)
- `POST /auth/login` — Login (returns JWT token)

### Auth Endpoints (JWT required)
- `GET /auth/me` — Get current user profile
- `POST /auth/change-password` — Change password

### Dashboard Endpoints
- `GET /api/posts?status=queue|scheduled|history&limit=20` — Get posts by status
- `GET /api/stats` — Stats + plan info (pending, approved, published, generated_today, plan_name, etc.)
- `POST /api/approve` — Approve/reject/edit a post (auto-computes scheduled_for if not provided)
- `POST /api/publish-now` — Set scheduled_for to NOW() for immediate publishing
- `POST /api/settings` — Update client settings (daily limit, publishing slots)
- `GET /api/client-profile/<id>` — Get client profile with dynamic prompts
- `PUT /api/client-profile/<id>` — Update client profile
- `GET /api/niches` — Get available niches with defaults
- `POST /api/generate-now` — Trigger n8n content generation webhook
- `GET /api/events` — SSE stream for real-time updates
- `POST /api/notify` — Called by n8n to broadcast events to dashboard

### Worker Endpoints (called by queue_worker_v5.py)
- `GET /api/worker/due-posts` — Posts where scheduled_for <= NOW(), approved+draft, retry < 3
- `GET /api/worker/upcoming-posts` — Future scheduled posts for display
- `POST /api/worker/mark-publishing` — Atomic lock (draft → publishing)
- `POST /api/worker/mark-published` — Set published + broadcast SSE event
- `POST /api/worker/mark-failed` — Retry with 10m/30m/60m backoff, or permanent fail at 3 retries
- `POST /api/worker/cleanup` — Run cleanup_posts() SQL function

### Legacy Endpoints
- `POST /execute` — Direct Playwright execution (used by n8n)
- `GET /health` — Health check

## Dashboard (Next.js 14)

### Dark Theme
All components use CSS custom property tokens, NOT hardcoded Tailwind colors:
- `bg-bg` — page background
- `bg-surface` — card/panel background (replaces `bg-white`)
- `bg-surface-2` — secondary surface (replaces `bg-gray-100/200`)
- `text-text-primary` — primary text (replaces `text-gray-900`)
- `text-muted` — secondary text (replaces `text-gray-400/500/600`)
- `border-stroke` — borders (replaces `border-gray-200`)
- `text-accent` / `accent-gradient` — brand gold color
- `text-bg` — text on accent backgrounds

**Never use** `bg-white`, `bg-gray-*`, `text-gray-*`, or `border-gray-*` in components.

### Toast System
Toasts are managed in `AppContext.tsx` (shared across all pages):
- `showToast(message, type)` — from `useAppContext()`
- `ToastContainer` renders in `LayoutWrapper.tsx`
- Do NOT use `useToast()` hook directly in pages — use `useAppContext()` instead

### API Client (api.ts)
- `apiFetch()` wrapper handles 401 → clears auth → redirects to `/login`
- `getCurrentClientId()` returns `string | null` (no hardcoded fallback)
- Auth endpoints (`login`, `register`) use raw `fetch()` (no JWT needed)
- All other endpoints use `apiFetch()` for automatic session handling
- All responses safely parsed (text first, then JSON)

### SSE (Real-time Updates)
- `useSSE` hook connects to `/api/events` endpoint
- Events: `new_posts`, `post_approved`, `post_rejected`, `publish_now`, `post_published`
- Used in LayoutWrapper (stats refresh), Queue, Scheduled pages

### Authentication
- JWT tokens stored in localStorage (`postflow_token`, `postflow_user`)
- `auth.ts` provides `isLoggedIn()`, `getUser()`, `logout()`
- Protected pages redirect to `/login` if no valid token
- Public pages: `/login`, `/register`, `/onboarding`

## Queue Worker v5

`queue_worker_v5.py` — Scheduled post publisher. Polls Flask API, publishes via Playwright.

**Key differences from v4:**
- No direct DB (psycopg2) — all operations through Flask API
- `QALAM_API_URL` env var (default: `http://localhost:5050`)
- `QALAM_AUTH_TOKEN` env var for JWT authentication
- `QALAM_TIMEZONE` env var (default: `Asia/Karachi`)
- `PLAYWRIGHT_DIR` relative to script location (no hardcoded path)
- Validates LinkedIn credentials before launching Playwright

**Flow:** Poll `/api/worker/due-posts` → lock via `/api/worker/mark-publishing` → run Playwright subprocess → report via `/api/worker/mark-published` or `/api/worker/mark-failed`

**Retry logic:** 10min → 30min → 60min backoff. Permanent fail after 3 attempts.

## Database Schema

Key tables:
- **users** — Login credentials, JWT auth (email, password_hash, client_id, role)
- **clients** — LinkedIn accounts (name, niche, linkedin_email/password, plan_id, publishing_slots)
- **plans** — Subscription tiers (daily_post_limit, can_schedule, can_analytics, can_generate_now)
- **client_effective_limits** — View joining clients + plans with COALESCE logic
- **posts** — Content (content, topic_pillar, approval_status, post_status, scheduled_for, retry_count)

**Post lifecycle:** `pending/draft` → `approved/draft` (with scheduled_for) → `publishing` → `published`
**Failure path:** `publishing` → `draft` (retry with backoff) → `failed` (after 3 retries)

PostgreSQL runs on port **5433** (not 5432). Username: `hragent`.

## Plans System

```
plans table → clients.plan_id → client_effective_limits view → /api/stats
```

- Plans define limits: daily_post_limit, monthly_post_limit, can_schedule, can_analytics, can_generate_now
- Clients can override daily limit via `limit_override_daily`
- `client_effective_limits` view uses `COALESCE(client override, plan default)`
- Dashboard reads all limits from `/api/stats` — no hardcoded defaults in frontend

## Tauri Desktop App (src-tauri/)

Tauri 2 wraps the Next.js dashboard as a native desktop app and bundles the queue worker as a sidecar.

### How it works:
- `tauri.conf.json` points `frontendDist` to `../dashboard/out` (static export)
- `beforeBuildCommand` runs `cd ../dashboard && npm run build` automatically
- `qalam-worker` binary is bundled as an `externalBin` sidecar
- On app startup, `lib.rs` spawns the sidecar with env vars and keeps it alive via `app.manage(child)`
- Sidecar stdout/stderr is captured and logged via `tauri::async_runtime::spawn` — look for `[WORKER]` lines

### Environment variables passed to sidecar (lib.rs):
| Var | Source | Purpose |
|-----|--------|---------|
| `QALAM_API_URL` | env or fallback `http://localhost:5050` | Flask API endpoint |
| `QALAM_TIMEZONE` | hardcoded `Asia/Karachi` | Worker scheduling timezone |
| `QALAM_RESOURCES_DIR` | `app.path().resource_dir()` | Dir containing `linkedin_actions.py` + `humanizer.py` |
| `QALAM_PYTHON` | prefers `playwright/venv/bin/python`, falls back to `which python3` | Python interpreter for LinkedIn actions |

### Python interpreter resolution (lib.rs):
- Checks `<CARGO_MANIFEST_DIR>/../playwright/venv/bin/python` first — this venv has all deps (playwright, etc.)
- Falls back to `which python3` if venv not found (production install — user must ensure deps are available)

### Bundled resources (tauri.conf.json):
- `resources/linkedin_actions.py` → installed as `linkedin_actions.py` in resource dir
- `resources/humanizer.py` → installed as `humanizer.py` in resource dir
- Both files must be kept in sync with `playwright/` when edited — copy manually:
  ```bash
  cp playwright/linkedin_actions.py src-tauri/resources/
  cp playwright/humanizer.py src-tauri/resources/
  ```

### Worker PLAYWRIGHT_DIR resolution (queue_worker_v5.py):
- **Frozen (PyInstaller bundle):** reads `QALAM_RESOURCES_DIR` env var → falls back to `sys.executable` parent
- **Dev (plain Python):** uses `Path(__file__).parent.resolve()` (the `playwright/` dir)

### API URL configuration:
- **Development (default):** `QALAM_API_URL` falls back to `http://localhost:5050` if not set
- **Production:** Tauri must set `QALAM_API_URL=https://api.byqalam.com` via environment (e.g. in `tauri.conf.json` or OS env before launch)
- To go production: change the fallback in `lib.rs` back to `https://api.byqalam.com` OR inject `QALAM_API_URL` at build/launch time

### Sidecar naming convention:
Binary must be named `qalam-worker-{target-triple}` in `src-tauri/binaries/`:
- Linux: `qalam-worker-x86_64-unknown-linux-gnu`
- Windows: `qalam-worker-x86_64-pc-windows-msvc.exe`

### Bundle targets:
Currently `deb` and `rpm` only (AppImage disabled — `linuxdeploy` issue on Arch).

### Plugins:
- `tauri-plugin-shell` — Required for sidecar spawning
- `tauri-plugin-log` — Debug logging (debug builds only)

### Capabilities (default.json):
- `core:default`, `shell:allow-execute`, `shell:allow-spawn`

## Important Notes

- **Brand:** "Qalam" everywhere user-facing. Internal code may still reference "postflow" in localStorage keys.
- **No hardcoded client IDs** — `getCurrentClientId()` returns null if not logged in
- **No console.log in production** — Only `console.error` for actual errors
- **Dark theme only** — Use token classes, never hardcoded gray/white colors
- **PostgreSQL port** — 5433 (not 5432)
- **Flask is the gateway** — Dashboard and worker both talk to Flask, never directly to DB
- **SSE for real-time** — Worker broadcasts `post_published` events through Flask
- **n8n role reduced** — Only handles AI content generation (called via webhook from Flask)
- **Timezone** — Scheduling uses browser's local timezone, stored as UTC, worker uses `QALAM_TIMEZONE` env var
