# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Superpowers Workflow Rule

Use the Superpowers workflow only when the task justifies it. Default is to skip it for simple work.

**Skip the workflow for:**
- Single-file edits (typos, renaming, small UI tweaks)
- Straightforward bug fixes with an obvious cause
- Config or copy changes
- Anything where the solution is already clear and low-risk

**Use the workflow for:**
- New features that touch multiple files or components
- Architectural changes (DB schema, auth, API design, queue system)
- Tasks that have already gone wrong once and risk re-correction loops
- Anything that affects how core systems interact

**When triggered, order of operations:**
1. `superpowers:brainstorming` — validate intent, surface edge cases
2. `superpowers:test-driven-development` — define tests before implementation
3. Implement
4. `superpowers:verification-before-completion` — confirm before claiming done

**Rule of thumb:** If the task can be described in one sentence and touches one file — just do it. If it requires explaining the approach first — run the workflow.

## Project Overview

**Qalam** — LinkedIn content automation SaaS. Users connect their LinkedIn account, AI generates posts, users approve/schedule via dashboard, and posts are published automatically.

**Brand:** Qalam. All user-facing references use "Qalam".

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
- **n8n** — AI content generation pipeline (called via webhook from Flask)
- **Ollama** — Cloud API for content generation, called by n8n. **Local Ollama models are not used.** Future plan: migrate to paid models (Claude, Gemini, ChatGPT) via direct API keys.

### What's NOT in the stack:
- ❌ Direct DB access from frontend (uses Flask API)
- ❌ SQLAlchemy/Alembic (plain SQL only)
- ❌ Redis
- ❌ Local Ollama models (cloud API only)

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
│   │   │   ├── ui/            # PostCard, Toast, Sheet, SkeletonCard, etc.
│   │   │   └── FeedbackBanner.tsx  # Star-rating widget (shown 30d after install)
│   │   ├── context/
│   │   │   └── AppContext.tsx  # Shared state: toasts, scheduled count, pulse, refreshSignal
│   │   ├── hooks/
│   │   │   ├── useToast.ts    # Legacy (toast now in AppContext)
│   │   │   └── useSSE.ts      # Server-Sent Events hook
│   │   └── lib/
│   │       ├── api.ts             # Flask API client (apiFetch with 401 + error reporting)
│   │       ├── errorReporter.ts   # Fire-and-forget error reporter → /api/feedback/error
│   │       ├── auth.ts            # JWT auth helpers
│   │       ├── config.ts          # App configuration
│   │       ├── types.ts           # TypeScript interfaces
│   │       └── utils.ts           # Helper functions
│   ├── .env.local             # NEXT_PUBLIC_API_URL, NEXT_PUBLIC_N8N_URL
│   └── package.json
│
├── playwright/
│   ├── action_server.py       # Flask API server (ALL endpoints)
│   ├── config.py              # DB_CONFIG, CLIENT_ID, JWT_SECRET (all from env vars)
│   ├── linkedin_actions.py    # LinkedIn browser automation
│   ├── queue_worker_v5.py     # Scheduled post publisher (uses Flask API)
│   ├── prompt_builder.py      # AI prompt templates per niche
│   ├── humanizer.py           # Delay/behavior utilities
│   ├── uploads/               # User-uploaded post images (served by Flask, gitignored except .gitkeep)
│   └── requirements.txt       # playwright, flask, requests, psycopg2, etc.
│
├── database/
│   └── schema.sql             # Full schema (run once)
│
├── src-tauri/
│   ├── src/lib.rs             # Tauri app entry — sidecar launch + both auto-updaters
│   ├── src/script_updater.rs  # linkedin_actions.py hotfix updater (version check + SHA-256)
│   ├── Cargo.toml             # Rust deps: tauri, tauri-plugin-shell/log/updater/process, reqwest, sha2
│   ├── tauri.conf.json        # App config: frontendDist, externalBin, macOS bundle config
│   ├── entitlements.plist     # macOS entitlements: network, subprocess spawn, PyInstaller support
│   ├── binaries/              # Sidecar binaries (qalam-worker-{target-triple})
│   └── capabilities/default.json  # Permissions: core, shell, updater, process
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
- `GET /api/posts?status=queue|scheduled|history&limit=20` — Get posts by status (includes `images` array per post)
- `GET /api/stats` — Stats + plan info (pending, approved, published, generated_today, plan_name, etc.)
- `POST /api/approve` — Approve/reject/edit a post (auto-computes scheduled_for if not provided)
- `POST /api/publish-now` — Set scheduled_for to NOW() for immediate publishing
- `POST /api/settings` — Update client settings (daily limit, publishing slots, auto_gen_enabled)
- `GET /api/client-profile/<id>` — Get client profile with dynamic prompts
- `PUT /api/client-profile/<id>` — Update client profile
- `GET /api/niches` — Get available niches with defaults
- `POST /api/generate-now` — Trigger n8n content generation webhook. Returns 403 if `auto_gen_enabled = false` for the client. Check this flag from DB before calling n8n.
- `GET /api/events` — SSE stream for real-time updates
- `POST /api/notify` — Called by n8n to broadcast events to dashboard. Requires `client_id` in body (returns 400 if missing). Requires `X-Qalam-Service-Token` header.
- `GET /api/analytics/pillars` — Content pillar performance (topic_pillar, total, approved, rejected, approval_rate_pct)
- `GET /api/analytics/daily?days=7` — Daily activity last N days (day, generated, published, rejected)

### Image Endpoints
- `POST /api/posts/<post_id>/images` — Upload images (multipart/form-data, field: `images[]`). Max 4 images per post, 5MB each, JPEG/PNG/GIF only. Validates post ownership.
- `GET /api/posts/<post_id>/images` — List images for a post
- `GET /api/images/<image_id>` — Serve image file (**no auth required** — used directly in `<img src>`)
- `DELETE /api/images/<image_id>` — Delete image file + DB row, reorders remaining by sort_order

**Image upload from dashboard:** Use FormData with `files.forEach(f => fd.append('images[]', f))`. Do NOT set `Content-Type` header — browser sets it with multipart boundary. Inject `Authorization` header manually (not via apiFetch default).

### Worker Endpoints (called by queue_worker_v5.py)
- `GET /api/worker/due-posts` — Posts where scheduled_for <= NOW(), approved+draft, retry < 3 (includes `images` array with id, filename, sort_order)
- `GET /api/worker/upcoming-posts` — Future scheduled posts for display
- `POST /api/worker/mark-publishing` — Atomic lock (draft → publishing)
- `POST /api/worker/mark-published` — Set published + broadcast SSE event
- `POST /api/worker/mark-failed` — Retry with 10m/30m/60m backoff, or permanent fail at 3 retries
- `POST /api/worker/cleanup` — Run cleanup_posts() SQL function

### Updater Endpoints
- `GET /updater/version.json` — Script version + SHA-256 checksum (used by `script_updater.rs`)
- `GET /updater/linkedin_actions.py` — Serves latest script file for hotfix download
- `GET /updater/app-version.json` — Latest app version info (version, tag, notes)
- `GET /updates/<target>/<arch>/<current_version>` — Tauri updater manifest. Returns proxy download URL + `.sig` content; 204 if up to date.

### Release / Download Endpoints (private repo support)
- `GET /api/release/latest` — Full latest release info for download page. Returns Flask proxy URLs (not GitHub direct URLs) so private-repo assets are publicly downloadable.
- `GET /api/download/<platform>` — Streaming proxy for release assets using server-side `GITHUB_TOKEN`. Platforms: `windows` | `mac-silicon` | `mac-intel` | `deb` | `rpm`

**Private repo setup:** Set `GITHUB_TOKEN` env var on the server (PAT with `repo` scope). All GitHub API calls use `_gh_headers()` helper which injects the token. Without it, only public repos work.

### Feedback Endpoints
- `POST /api/feedback/error` — Auto error reporting from client (no auth required; uses JWT user if present)
- `POST /api/feedback/rating` — User 1-5 star rating + optional message
- `GET /api/feedback/all` — Admin view, last 100 feedback rows

### Health
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

**Exception — input field borders:** `border-stroke` (#212121) is nearly invisible against `bg-surface-2` (#1c1c1c). For input fields use `border-gray-200` (#2d2d2d) which gives adequate contrast on the dark page background.

### Toast System
Toasts are managed in `AppContext.tsx` (shared across all pages):
- `showToast(message, type)` — from `useAppContext()`
- `ToastContainer` renders in `LayoutWrapper.tsx`
- Do NOT use `useToast()` hook directly in pages — use `useAppContext()` instead

### API Client (api.ts)
- `apiFetch()` wrapper handles 401 → clears auth → redirects to `/login`
- Network errors in `apiFetch()` are auto-reported via `errorReporter.ts` before re-throwing
- `getCurrentClientId()` returns `string | null` (no hardcoded fallback)
- Auth endpoints (`login`, `register`) use raw `fetch()` (no JWT needed)
- All other endpoints use `apiFetch()` for automatic session handling
- All responses safely parsed (text first, then JSON)
- `uploadPostImages(postId, files)` — FormData upload with manual JWT header, no Content-Type
- `deletePostImage(imageId)` — DELETE via apiFetch

### PostImage Type (types.ts)
```typescript
export interface PostImage {
  id: string
  original_name: string
  mime_type: string
  size_bytes: number
  sort_order: number
  url: string  // /api/images/<id>
}
```
`Post` interface has `images?: PostImage[]` — populated by `/api/posts` response.

### PostCard — Image Attach UI
- Paperclip button (📎 `Attach`) in action row — button order: `[Approve] [📎 Attach] [✏️ Edit] [Reject]`
- Attach button disabled when `images.length >= 4` or `isUploading`
- Hidden `<input type="file" multiple accept="image/jpeg,image/png,image/gif">` triggered by button click
- Client-side validation: max 5MB per file, JPEG/PNG/GIF only, total images ≤ 4
- Thumbnails shown below post meta row — visible in all views (queue/scheduled/history), delete (×) button only visible when `showActions` is true
- Image modal: full images shown after post content in the full-post modal
- State is local to PostCard — `images` initialized from `post.images || []`, updated on upload/delete

### Error Reporter (errorReporter.ts)
- `reportError(message, details)` — fire-and-forget, never throws
- Posts to `/api/feedback/error` with `app_version`, `os_info` (navigator.userAgent), JWT if present
- `APP_VERSION` constant must be kept in sync with the Tauri app version

### Feedback Banner (FeedbackBanner.tsx)
- Mounts in `LayoutWrapper.tsx` for all authenticated pages
- Shown 30 days after first login (`qalam_install_date` localStorage key)
- Re-shown every 60 days (`qalam_feedback_shown` localStorage key)
- Star rating (1-5) + optional text → `POST /api/feedback/rating`

### Connection Status (LayoutWrapper + Header)
- `isOnline` state lives in `LayoutWrapper`, passed to `<Header isOnline={isOnline} />`
- `fetchStats` sets `isOnline=true` on success, `false` on catch
- Browser `online`/`offline` events wired in `LayoutWrapper` useEffect
- Header status dot: green = connected, red = offline; text shows "Server unreachable" when offline
- **Do not** manage `isOnline` inside Header itself — it is always a prop from LayoutWrapper

### SSE (Real-time Updates)
- `useSSE` hook connects to `/api/events` endpoint
- Events: `new_posts`, `post_approved`, `post_rejected`, `publish_now`, `post_published`
- **Only used in LayoutWrapper** — pages use `refreshSignal` from AppContext instead of their own SSE connections
- Both SSE callbacks and the manual refresh button call `triggerRefresh()` which increments `refreshSignal` counter
- All pages (queue, scheduled, content, analytics, settings) add `refreshSignal` to a dedicated useEffect to re-fetch their data — do NOT modify existing mount/polling effects, add a separate one
- Reconnect timer is tracked via `useRef` and cleaned up on unmount to prevent memory leaks

### Authentication
- JWT tokens stored in localStorage (`postflow_token`, `postflow_user`) — **do NOT rename these keys; existing installs depend on them**
- `auth.ts` provides `isLoggedIn()`, `getUser()`, `logout()`
- Protected pages redirect to `/login` if no valid token
- Public pages: `/login`, `/register`, `/onboarding`

### Input Fields — WebKit/Tauri Padding Bug
`globals.css` globally zeroes out `padding-top` and `padding-bottom` on all `input` elements (WebKit alignment fix). This means Tailwind `py-*` classes have **no effect** on inputs.

**Always use inline styles for input padding/height:**
```tsx
<input
  className="w-full bg-surface border border-gray-200 text-text-primary ..."
  style={{ padding: '12px 16px', height: '44px' }}
/>
```
This matches the login page input size and is the established pattern across all forms.

## Queue Worker v5

`queue_worker_v5.py` — Scheduled post publisher. Polls Flask API, publishes via Playwright.

**Configuration:**
- `QALAM_API_URL` env var (default: `http://localhost:5050`)
- `QALAM_AUTH_TOKEN` env var OR `PLAYWRIGHT_DIR/qalam_token.txt` file for JWT authentication
- `QALAM_TIMEZONE` env var (default: `Asia/Karachi`)
- `PLAYWRIGHT_DIR` relative to script location (no hardcoded path)
- No direct DB access — all operations through Flask API

**JWT handling:** Token is read dynamically on every API call via `get_auth_token()` — not cached at startup. This allows token refresh without restarting the worker. Checks env var first, then falls back to `qalam_token.txt` file. API 401 responses are logged with a clear message but don't crash the worker.

**Flow:** Poll `/api/worker/due-posts` → lock via `/api/worker/mark-publishing` → download images to temp dir → run Playwright subprocess → report via `/api/worker/mark-published` or `/api/worker/mark-failed` → cleanup temp images

**Image handling in worker:**
- `download_post_images(post)` — streams each image from `/api/images/<id>` to `tempfile.mkdtemp()`, returns list of local file paths
- `cleanup_temp_images(paths)` — `shutil.rmtree` on temp dir. Always runs in `finally` block.
- `image_paths` is defined before the subprocess `try` block so `finally` can always clean up
- Image paths passed to Playwright subprocess in `"image_paths"` key of the payload

**Retry logic:** 10min → 30min → 60min backoff. Permanent fail after 3 attempts.

## Database Schema

Key tables:
- **users** — Login credentials, JWT auth (email, password_hash, client_id, role)
- **clients** — LinkedIn accounts (name, niche, linkedin_email/password, plan_id, publishing_slots, auto_gen_enabled)
- **plans** — Subscription tiers (daily_post_limit, can_schedule, can_analytics, can_generate_now)
- **client_effective_limits** — View joining clients + plans with COALESCE logic
- **posts** — Content (content, topic_pillar, approval_status, post_status, scheduled_for, retry_count)
- **post_images** — User-attached images per post (id UUID PK, post_id FK → posts ON DELETE CASCADE, filename, original_name, mime_type, size_bytes, sort_order, created_at). Index: `idx_post_images_post_id`
- **feedback** — Error reports + user ratings (type: `error`|`rating`, rating 1-5, message, error_details JSONB, app_version, os_info)

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
- On app startup, `lib.rs` sets up tray, autostart, watchdog, and script updater
- **System tray:** left-click or "Open Qalam" shows/focuses window; "Quit" exits. Window `CloseRequested` → hide (not quit)
- **Autostart:** `tauri-plugin-autostart` enables login autostart on first run (`--minimized` flag passed)
- **Watchdog:** `qalam-worker` runs inside an infinite `loop` in `async_runtime::spawn`. On crash/exit, waits 5s then restarts automatically. Log prefix: `[WATCHDOG]` / `[WORKER]` / `[WORKER ERR]`
- **Debug output:** All `println!`/`eprintln!` calls use `debug_println!`/`debug_eprintln!` macros gated by `#[cfg(debug_assertions)]`. Release builds produce no stdout/stderr output. Both `lib.rs` and `script_updater.rs` use these macros.

### Environment variables passed to sidecar (lib.rs):
| Var | Source | Purpose |
|-----|--------|---------|
| `QALAM_API_URL` | `DATA_DIR/qalam_api_url.txt` → env var → `https://api.byqalam.com` | Flask API endpoint |
| `QALAM_TIMEZONE` | system TZ detection: `TZ` env → `/etc/timezone` → `UTC` fallback | Worker scheduling timezone |
| `QALAM_RESOURCES_DIR` | `app.path().resource_dir()` | Dir containing `linkedin_actions.py` + `humanizer.py` |
| `QALAM_PYTHON` | prefers `playwright/venv/bin/python`, falls back to `which python3` | Python interpreter for LinkedIn actions |
| `QALAM_DATA_DIR` | `app.path().app_local_data_dir()` | Writable dir for token + config files (see Auth Token below) |

### Auth Token — how the worker gets its JWT

The Tauri app does NOT pass a hardcoded token at startup (tokens expire). Instead:
1. User logs in via the embedded dashboard
2. Login page calls `saveTauriToken(token)` → invokes Rust command `save_auth_token`
3. Rust writes token to `QALAM_DATA_DIR/qalam_token.txt`
4. Worker reads token dynamically on every API call from `DATA_DIR/qalam_token.txt`
5. On token refresh (re-login), file is overwritten → worker picks up new token within 60s

**Data dir locations:**
- Linux: `~/.local/share/com.byqalam.app/`
- Windows: `C:\Users\{user}\AppData\Local\com.byqalam.app\`
- macOS: `~/Library/Application Support/com.byqalam.app/`

**Custom API URL:** dashboard stores URL in `localStorage('api_url')`. LayoutWrapper syncs it to `QALAM_DATA_DIR/qalam_api_url.txt` on mount via `saveTauriApiUrl`. Tauri reads this at next startup to set `QALAM_API_URL` for the worker.

**Tauri helper:** `dashboard/src/lib/tauri.ts` — `saveTauriToken()`, `saveTauriApiUrl()`, `tauriInvoke()`. Uses `window.__TAURI_INTERNALS__` directly (no npm package needed).

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
- Linux:         `qalam-worker-x86_64-unknown-linux-gnu`
- Windows:       `qalam-worker-x86_64-pc-windows-msvc.exe`
- macOS Silicon: `qalam-worker-aarch64-apple-darwin`
- macOS Intel:   `qalam-worker-x86_64-apple-darwin`

### Bundle targets:
`deb`, `rpm`, `nsis`, `dmg` — controlled per-platform via `--bundles` flag in CI.
AppImage disabled (linuxdeploy issue on Arch).

### Plugins:
- `tauri-plugin-shell` — Required for sidecar spawning
- `tauri-plugin-log` — Debug logging (debug builds only)
- `tauri-plugin-updater` — Full app auto-update via signed releases
- `tauri-plugin-process` — Required by updater for restart after install
- `tauri-plugin-autostart` — Login autostart (enabled on first run in `.setup()`)
- `tray-icon` feature on `tauri` crate — System tray (built into Tauri core, no separate plugin)
- `tokio = { features = ["time"] }` — Used by watchdog loop for `tokio::time::sleep`

### Capabilities (default.json):
- `core:default`, `shell:allow-execute`, `shell:allow-spawn`
- `autostart:allow-enable`, `autostart:allow-disable`, `autostart:allow-is-enabled`

## CI/CD — GitHub Actions (`.github/workflows/build.yaml`)

Triggered on `git push origin --tags` (any `v*` tag). Builds 4 artifacts in parallel and uploads all to a single GitHub Release.

### Matrix:
| Runner | Sidecar target | Bundle output |
|--------|---------------|---------------|
| `ubuntu-22.04` | `x86_64-unknown-linux-gnu` | `.deb`, `.rpm` |
| `windows-latest` | `x86_64-pc-windows-msvc` | `.exe` (NSIS) |
| `macos-latest` | `aarch64-apple-darwin` | `.dmg` (Apple Silicon) |

**Note:** Intel macOS (`macos-13`) removed — GitHub deprecated that runner. Apple Silicon covers 90%+ of Mac users.

### Per-build steps:
1. Checkout code
2. **Install Rust first** (must come before sidecar build so `rustc -vV` is reliable)
3. Build `qalam-worker` sidecar via PyInstaller (Python 3.11)
4. Copy binary to `src-tauri/binaries/qalam-worker-{target}` (macOS target hardcoded to `aarch64-apple-darwin`)
5. Install Node + `npm ci` in `dashboard/`
6. `tauri-action` runs `cargo tauri build --bundles {platform_bundles}`
7. Artifacts uploaded to GitHub Release automatically

### Release asset filenames (Tauri naming convention):
- `Qalam_x.x.x_amd64.deb` + `.sig`
- `Qalam-x.x.x-1.x86_64.rpm` + `.sig`
- `Qalam_x.x.x_x64-setup.exe` + `.sig`
- `Qalam_x.x.x_aarch64.dmg` + `.sig` (Apple Silicon)

`.sig` files are cryptographic signatures generated by `tauri-action` using `TAURI_SIGNING_PRIVATE_KEY`. Required for the in-app auto-updater to verify download integrity.

### Git workflow
Work is committed and pushed **directly to `main`** — no feature branches. Previous sessions used a `fix/production-readiness-v1.3.0` branch which was merged into `main` on 2026-04-20 and deleted. Do not recreate it.

### To ship a new release:
```bash
git add .
git commit -m "your message"
git push origin main
git tag v1.x.x
git push origin v1.x.x
```

Tagging triggers CI automatically. No need to push `--tags` separately — just push the specific tag.

### Qalam website download page (`qalam-frontend` repo: `Tayyab-Hussayn/Linkedn-agent-frontend`):
- `src/hooks/useGitHubRelease.ts` — fetches from `https://api.byqalam.com/api/release/latest` (Flask proxy, no token in browser)
- `src/pages/DownloadPage.tsx` — card layout: macOS (left) | Windows (center, featured) | Linux (right)
- macOS: Apple Silicon only (Intel greyed out — no CI runner available)
- Linux toggle: .deb / .rpm (AppImage disabled)
- Windows: featured card with "Most Popular" badge, golden gradient border + button
- **No `VITE_GITHUB_TOKEN` needed** — token lives on the Flask server only (`GITHUB_TOKEN` env var)

### GitHub Actions secrets required:
| Secret | Purpose |
|--------|---------|
| `TAURI_SIGNING_PRIVATE_KEY` | Signs release artifacts (`.sig` files). Generated via `cargo tauri signer generate` |
| `GITHUB_TOKEN` | Auto-provided by GitHub. Creates releases + uploads assets |

## Auto-Update System

Two independent update mechanisms run on every app launch:

### Type 1 — Script Hotfix (linkedin_actions.py)
Lightweight, custom system. Patches the LinkedIn automation script without a full app update.

**Flow:** App starts → `script_updater.rs` (background thread) → `GET {API}/updater/version.json` → compare local version → if different: download script, verify SHA-256 checksum, atomic write → worker picks up new script on next cycle.

**Server endpoints (action_server.py):**
- `GET /updater/version.json` — returns `{ version, checksum, size }`
- `GET /updater/linkedin_actions.py` — serves raw script file

**Version tracking:** First line of `playwright/linkedin_actions.py` must be `# version: X.Y.Z`. Local version stored in `linkedin_actions_version.txt` in resource dir. Bump version comment when shipping script fixes.

**`do_post` signature:** `async def do_post(page, content: str, image_paths: list = None) -> str`
- If `image_paths` is provided, clicks the LinkedIn media button, uses `page.expect_file_chooser()` + `file_chooser.set_files(image_paths)` to attach images before posting
- Tries 6 selectors for the media button; graceful fallback to text-only if any exception occurs
- Remember to sync `src-tauri/resources/linkedin_actions.py` after any changes to `playwright/linkedin_actions.py`

**Fail-safe:** Network errors, checksum mismatches, or write failures are logged and skipped — app always launches with the existing script.

### Type 2 — Full App Update (Tauri Updater Plugin)
Uses Tauri's built-in updater with cryptographic signing.

**Flow:** App starts → waits 10s → `GET {API}/updates/{target}/{arch}/{current_version}` → if newer version: downloads binary, verifies `.sig` against public key in `tauri.conf.json` → installs silently → applies on next launch.

**Server endpoint (action_server.py):**
- `GET /updates/<target>/<arch>/<current_version>` — proxies GitHub Releases API. Returns Tauri update manifest (JSON with `version`, `url`, `signature`) if newer version exists, or `204 No Content` if up to date.

**Signing keypair:**
- Private key: `~/.tauri/qalam.key` (also in GitHub secret `TAURI_SIGNING_PRIVATE_KEY`)
- Public key: embedded in `tauri.conf.json` → `plugins.updater.pubkey`
- CI generates `.sig` files alongside each release artifact

**Key files:**
- `src-tauri/src/script_updater.rs` — script hotfix logic (reqwest + sha2)
- `src-tauri/src/lib.rs` — wires both updaters into Tauri `.setup()` closure
- `src-tauri/tauri.conf.json` → `plugins.updater` — endpoint URL + public key

## Tauri macOS Notes

- **entitlements.plist** — Required for macOS. Grants: `network.client`, `cs.allow-jit`, `cs.allow-unsigned-executable-memory`, `cs.disable-library-validation`. Without it, the sidecar and network calls are killed by the OS.
- **`default_window_icon()`** — Never call `.unwrap()` on this. Returns `None` if icon can't be loaded, causing immediate crash. Use `if let Some(icon)` pattern.
- **Notarization** — App is not notarized (no Apple Developer account). Users on macOS need to go to System Settings → Privacy & Security → Open Anyway on first launch.
- **Apple Silicon only** — CI builds `aarch64-apple-darwin` only. Intel Mac users are not supported.

## Server Environment Variables

Production Flask server requires these env vars:

| Variable | Purpose | Default (dev only) |
|----------|---------|-------------------|
| `JWT_SECRET` | JWT signing key | `qalam-dev-secret-change-in-production` (prints warning) |
| `N8N_BASE_URL` | n8n URL for content generation webhooks | `http://localhost:5678` |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5433` |
| `DB_NAME` | Database name | `linkedin_agent` |
| `DB_USER` | Database user | `hragent` |
| `DB_PASSWORD` | Database password | `hragent123` |
| `GITHUB_TOKEN` | GitHub PAT for private repo access | _(none — required for downloads/updater)_ |

**Never commit real credentials.** `config.py` reads all secrets from env vars with dev-only fallbacks.

## Database Connection Pooling

`action_server.py` uses `psycopg2.pool.ThreadedConnectionPool` (min 2, max 10 connections). The pool is lazily initialized on first query via `get_db_pool()`. All queries go through `db_query()` which gets/returns connections from the pool.

## Important Notes

- **Brand:** "Qalam" everywhere user-facing. localStorage keys remain `postflow_token` / `postflow_user` — **do NOT rename them**, existing installs depend on these exact key names.
- **No hardcoded client IDs** — `get_client_id()` returns `None` if no JWT present; endpoints return 401
- **No console.log in production** — Only `console.error` for actual errors
- **Dark theme only** — Use token classes, never hardcoded gray/white colors
- **Input padding** — Always use `style={{ padding: '12px 16px', height: '44px' }}` on inputs; `py-*` classes are zeroed by globals.css
- **Input borders** — Use `border-gray-200` (not `border-stroke`) for input fields; stroke is too faint
- **PostgreSQL port** — 5433 (not 5432)
- **Flask is the gateway** — Dashboard and worker both talk to Flask, never directly to DB
- **SSE for real-time** — Only LayoutWrapper connects to SSE; pages react via `refreshSignal` from AppContext
- **Image uploads** — `playwright/uploads/` stores all user images. Filenames are UUID-based. Directory is gitignored (`.gitkeep` committed). Served via `GET /api/images/<id>` with no auth. Deleted on post deletion via `ON DELETE CASCADE`.
- **PostCard button order** — `[Approve] [📎 Attach] [✏️ Edit] [Reject]` — Attach is left of Edit
- **PWA/ServiceWorker** — Skipped inside Tauri (`__TAURI__` window check). Only active in browser deployments.
- **n8n role** — Only handles AI content generation. n8n workflow 02 ("Daily Content Generation") runs on its own cron (8AM & 6PM). It accesses the DB **directly** (not through Flask). The flow is: cron → Fetch Active Clients (direct DB, includes `auto_gen_enabled`) → Check Posts Today → Decide Generation Plan (JS node checks `auto_gen_enabled` and skips if false; always generates exactly **1 post** per run) → Build Prompt → Flask `/api/client-profile` → AI → Save Posts (direct DB) → Flask `/api/notify`
- **auto_gen_enabled** — Stored in `clients` table. Controls both scheduled n8n runs and manual "Generate Now". When false: n8n "Decide Generation Plan" returns `skip: true`; Flask `/api/generate-now` returns 403; dashboard shows a warning toast before any API call. Workflow 02 exports live in `n8n-workflows/` — edit the JSON and update `workflow_entity.nodes` in n8n's DB to apply changes without UI access.
- **Timezone** — Tauri detects system timezone (`TZ` env → `/etc/timezone` → UTC); browser uses local timezone; worker uses `QALAM_TIMEZONE` env var
- **GitHub repo** — Private. All download traffic goes through Flask proxy at `api.byqalam.com`
- **Registration** — Does not set niche. Niche is configured during onboarding flow.
- **Version sync** — `tauri.conf.json`, `Cargo.toml`, and `dashboard/src/lib/version.ts` (`APP_VERSION`) must all match. Dashboard components (`errorReporter`, `LayoutWrapper`, `FeedbackBanner`) import from `lib/version.ts` — single source of truth.
- **Current version** — `1.3.0` (released 2026-04-20, tagged `v1.3.0` on `main`)
