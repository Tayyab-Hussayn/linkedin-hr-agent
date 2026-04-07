Here is the full codebase review:

  ---
  Qalam Code Review Report

  ---
  🔴 Critical — Must Fix Before Shipping

  1. JWT Secret hardcoded — playwright/config.py:39
  JWT_SECRET = "postflow-super-secret-key-change-in-production" — an attacker can forge valid JWT tokens
  for any user. Load from os.environ['JWT_SECRET'] with no default.

  2. DB credentials hardcoded in plaintext — playwright/config.py:14
  postgresql://hragent:hragent123@localhost:5433/linkedin_agent is in source. Anyone inspecting the
  installed app on their machine has Postgres credentials. Move to env vars.

  3. Hardcoded fallback Client ID — playwright/config.py:17
  CLIENT_ID = "hr-pro-001". action_server.py falls back to this when no JWT is present — any
  unauthenticated request silently operates on this client's data.

  4. Old queue_worker.py (v4) still ships — playwright/queue_worker.py:18-24
  Has PLAYWRIGHT_DIR = "/home/krawin/exp.code/linkedin-hr-agent/playwright" — your home directory
  hardcoded. Will crash on every client machine. Also contains its own DB_CONFIG with plaintext
  credentials.

  5. window.location.href = '/login' used for navigation — auth.ts:37, api.ts:51, login/page.tsx:51,
  register/page.tsx:59
  In a Tauri static export, this performs a hard filesystem navigation. On client machines, /login may
  not resolve to a valid file path — resulting in a blank page. Replace with router.push('/login')
  everywhere.

  6. Service worker and PWA code active in Tauri — ServiceWorkerRegistration.tsx, PWAInstallPrompt.tsx,
  manifest.ts
  Service workers don't function in Tauri's WebView. navigator.serviceWorker.register() will fail
  silently. The PWA install prompt will never fire. This dead code creates false runtime assumptions.

  7. LinkedIn passwords stored in plaintext — onboarding/page.tsx:65-68, DB schema
  Credentials sent to Flask and stored as plaintext in PostgreSQL. The UI does not claim encryption, but
  this is unacceptable for a SaaS — if the DB is ever leaked, every client's LinkedIn account is
  compromised. At minimum, encrypt at rest with a server-side key.

  8. isLoggedIn() checks token existence, not validity — auth.ts:33, LayoutWrapper.tsx:25-29
  Route protection passes an expired or tampered token. Protected pages render with the full dashboard UI
   before the first API call returns 401. Validate the token structure (check expiry) client-side or call
   /auth/me on app load.

  9. CSP disabled — tauri.conf.json:22
  "csp": null. AI-generated post content is rendered into the DOM — any XSS in that content can read
  localStorage (JWT token), make API calls, and call Tauri IPC commands. Set a strict CSP.

  10. ENVIRONMENT = "development" hardcoded — config.py:19
  Never read anywhere. The app always ships in development mode with no ability to switch behavior.

  ---
  🟠 High Priority — Fix Soon

  11. println! in Tauri not guarded by debug — lib.rs:37-39
  [TAURI] API URL: {api_url} and [TAURI] Python path: {python_path} emit to stdout in release builds,
  leaking configuration. Wrap in #[cfg(debug_assertions)].

  12. Timezone hardcoded to Asia/Karachi in binary — lib.rs:52
  Every client on every timezone gets posts scheduled in PKT. Read system timezone at runtime instead.

  13. "Reset daily limit for testing" button visible in production — content/page.tsx:121-133
  This dev/debug utility is visible to all users. Gate it behind an environment flag or admin role, or
  remove it entirely.

  14. Two SSE connections on Queue page — queue/page.tsx:45-57 + LayoutWrapper.tsx
  Both QueuePage and LayoutWrapper connect to /api/events simultaneously. Every event fires duplicate API
   calls. SSE should be owned by a single context and consumed via callbacks.

  15. SSE reconnect leaks connections — useSSE.ts:64-69
  setTimeout(connect, 5000) after an error creates a new EventSource but esRef belongs to the previous
  render cycle if the component unmounted. Net result: orphaned open SSE connections accumulating over
  time in a long-running desktop app.

  16. NEXT_PUBLIC_* vars baked at build time — dashboard/.env.local, api.ts:11-18
  With output: 'export', NEXT_PUBLIC_API_URL=http://localhost:5050 is a literal constant in the
  distributed JS. The settings page workaround (saving a custom URL to localStorage) is a band-aid — the
  build-time constant is the actual default for all users.

  17. Headful browser on client machine — linkedin_actions.py:75
  headless=False opens a visible Chromium window during every publish. On headless Linux environments,
  this crashes. Should be headless=True.

  18. No 2FA feedback to the user — linkedin_actions.py:156-163
  When LinkedIn triggers 2FA, the worker silently waits 25-35 seconds with no signal to the frontend. The
   Tauri window appears frozen. There needs to be a mechanism to surface this state.

  19. queue_worker.py:224 — timeout=None on subprocess
  If Playwright hangs (2FA, network stall, selector timeout), the entire worker loop blocks forever. The
  worker never polls again. Use a fixed timeout (the v5 worker already fixed this to 120s — v4 is still
  broken and should be deleted).

  20. action_server.py — new DB connection per request, no pool
  db_query() opens and closes a psycopg2.connect() on every call. Under any concurrent load this exhausts
   Postgres connection slots. Use psycopg2.pool.ThreadedConnectionPool.

  21. navigator.clipboard.writeText() unguarded — PostCard.tsx:135
  No try/catch and no Tauri clipboard permission configured. Will throw an unhandled rejection when
  clipboard access is blocked.

  22. API URL input in Settings not validated — settings/page.tsx:97-99
  An attacker or typo can redirect all API calls (including JWT tokens in Authorization headers) to an
  external server.

  23. "Free Plan" hardcoded in Sidebar — Sidebar.tsx:99
  plan_name is returned by the API and available in stats, but the sidebar always displays "Free Plan".
  Paid users see incorrect plan info.

  24. Auth logout doesn't clear n8n_url — auth.ts:33
  The n8n URL persists in localStorage after logout and will be picked up by the next user session on the
   same machine.

  25. CORS * with 0.0.0.0 bind — action_server.py:63, config.py:31
  Flask binds to all interfaces and returns Access-Control-Allow-Origin: *. If the machine is on a local
  network, the API is accessible (and CORS-open) to any other machine on that network.

  26. Stale closure in handleRemove — scheduled/page.tsx:150-153
  setScheduledCount(posts.length - 1) captures posts.length at call time. Rapid removals will produce
  wrong counts. Use setScheduledCount(prev => prev - 1).

  ---
  🟡 Medium Priority — Should Fix

  27. getScheduledPosts() in api.ts fetches 100 posts and filters in JS — api.ts:95-113
  Silently misses data if there are >100 posts. The /api/posts?status=scheduled endpoint exists — use it.

  28. getN8nUrl() defined in both config.ts and api.ts
  Two identical functions will silently diverge. Delete one and import from the other.

  29. autoGenEnabled toggle does nothing — content/page.tsx:168-199
  Looks functional but never calls any API. Users will think they toggled something when they didn't.

  30. Analytics period selector is cosmetic — analytics/page.tsx:19-41
  useEffect depends on [period] but no fetch passes period to the API. The chart always shows the same
  data regardless of which period is selected.

  31. HistorySection makes a duplicate API call — analytics/page.tsx:312-379
  Parent already fetches history (10 items). Child fetches history again (20 items). Consolidate into one
   fetch with the larger limit.

  32. calcHealthScore() always adds 25 for "no failed posts" — utils.ts:74
  The comment literally says // Default since we don't track failed in Stats interface. The score is
  always inflated. Either track failures or remove that dimension from the score.

  33. Hardcoded niche on registration — register/page.tsx:34
  niche: 'hr_professional' is hardcoded. All new users are created as HR professionals before onboarding.
   Defer niche assignment to onboarding completion.

  34. Chrome 120 user-agent hardcoded — linkedin_actions.py:50
  Chrome 120 was released in 2023. A multi-year-old user agent is a LinkedIn bot detection signal. Update
   it or generate it dynamically.

  35. Daily activity chart uses positional array mapping — analytics/page.tsx:157-199
  Maps ['Mon','Tue'...] by index to dailyActivity[index]. If the API ever returns data in any other
  order, the chart silently shows wrong data for wrong days.

  36. queue/page.tsx no refetch on route re-entry — queue/page.tsx:61
  No visibilitychange or focus handler. In Tauri, navigating away and back does not remount the page —
  the queue shows stale data until an SSE event arrives.

  37. Worker JWT expires after 30 days with no refresh — queue_worker_v5.py:29
  After 30 days, the worker's token is expired. All API calls return 401, publishing silently stops. The
  worker needs a re-auth mechanism or the token needs to be refreshed before expiry.

  38. React Compiler (babel-plugin-react-compiler) in production — package.json
  This is still experimental. It can introduce subtle rendering bugs that are hard to diagnose in a
  shipped desktop app.

  39. radix-ui installed but not imported anywhere
  Dead dependency adding to bundle weight. Remove it.

  ---
  🔵 Low Priority / Good to Know

  40. shadcn in devDependencies — package.json
  shadcn is a CLI scaffolding tool, not a runtime or build dependency. Remove from package.json.

  41. tick state for countdowns — scheduled/page.tsx:106-109
  The pattern works but tick is unexplained to future readers. A named useClock hook or a comment would
  clarify intent.

  42. getNextGenerationTime() magic numbers scattered — utils.ts:33-58, content/page.tsx:157
  Generation times 8 and 18 are in two files. No single source of truth. When they become configurable,
  multiple places need updating.

  43. trigger pulse double-fire within 3.5s — AppContext.tsx:30-33
  Two quick events within the 3.5s window will cancel the first pulse mid-animation. Low frequency edge
  case.

  44. Unused tw-animate-css — package.json
  A niche library. Consider migrating animations to Tailwind v4 native keyframes before it becomes
  unmaintained.

  45. as any for period type — analytics/page.tsx:79
  Minor type safety gap. The option values should be typed to match the period state union type.
