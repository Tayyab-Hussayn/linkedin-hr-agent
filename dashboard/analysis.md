# Qalam Dashboard — Full Codebase Review Report

---

## 🔴 Critical — Must Fix Before Shipping

### 1. Auth token passed in URL query parameter (SSE)
**File:** `src/hooks/useSSE.ts:34`
**Problem:** The JWT token is appended as a query parameter: `/api/events?token=${token}`. Tokens in URLs get logged in server access logs, browser history, proxy logs, and Tauri's webview history.
**Why it matters:** Token leakage is a security vulnerability. In a Tauri app, the URL persists in the webview.
**Fix:** SSE doesn't support custom headers — use a short-lived ticket endpoint instead. Client POSTs to `/auth/sse-ticket`, gets a one-time token, uses that in the SSE URL. The ticket expires after connection.

### 2. LinkedIn credentials sent & stored in plaintext
**File:** `src/app/onboarding/page.tsx:64-71`, `src/app/settings/page.tsx:102-103`
**Problem:** LinkedIn email and password are sent over HTTP as raw JSON via `api.updateProfile()`. No indication of encryption in transit or at rest. The onboarding UI tells users "credentials are stored securely" but the code just does a plain POST.
**Why it matters:** This is a Tauri app connecting to `localhost:5050` — no TLS. Someone's LinkedIn password traverses unencrypted. If the Flask backend stores it in plain text in Postgres, that's a full credential exposure.
**Fix:** At minimum, document that the connection is localhost-only. Better: encrypt credentials client-side before sending, or use an OAuth flow. Never store plaintext LinkedIn passwords in the database.

### 3. Auth endpoints (`login`, `register`, `getMe`) have zero error handling
**File:** `src/lib/api.ts:357-420`
**Problem:** `api.login()`, `api.register()`, `api.getMe()`, `api.updateProfile()`, `api.getNiches()`, `api.getClientProfile()`, `api.changePassword()` all call `res.json()` directly with no try/catch. If the server is down, returns HTML, or returns a non-200 status, these will throw unhandled exceptions. The login page wraps in try/catch, but `getMe()` at line 376 doesn't check `res.ok` — a 401 response will still try to parse the body.
**Why it matters:** When the Flask server isn't running (common in a desktop app), the app crashes on login rather than showing a useful error. These are the first APIs the user hits.
**Fix:** Every `res.json()` call in these auth methods needs the same safe-text-parse pattern used in `getPosts()` and `getStats()`. Check `res.ok` first.

### 4. Hardcoded fallback `hr-pro-001` client ID
**File:** `src/lib/api.ts:38-47`
**Problem:** `getCurrentClientId()` returns `'hr-pro-001'` as a fallback in 3 different cases: SSR, no user in localStorage, and JSON parse failure. This means any API call using `getCurrentClientId()` will silently use someone else's client ID if the user state is corrupted or absent.
**Why it matters:** A client could inadvertently see or modify another client's data. In a multi-tenant SaaS, this is a data isolation failure.
**Fix:** Return `null` on failure and force callers to handle the missing-client case (redirect to login, show error). Never fall back to a specific client ID.

### 5. No token expiry handling
**File:** `src/lib/auth.ts` (entire file)
**Problem:** `auth.isLoggedIn()` only checks if a token exists in localStorage — it never checks if the token is expired. There's no 401 interceptor anywhere in the API layer. If a token expires mid-session, every API call will silently fail (returning empty arrays/default stats) and the user will see a dashboard with all zeros.
**Why it matters:** Desktop apps run for hours/days without page refreshes. Token expiry is guaranteed to happen during normal use.
**Fix:** Add a 401 response check in the API layer. On 401, call `auth.logout()` or show a re-login prompt.

---

## 🟠 High Priority — Fix Soon

### 6. Mixed API backends — some calls go to Flask, some to n8n
**File:** `src/lib/api.ts`
**Problem:** `getPosts`, `getStats`, `submitDecision`, `publishNow`, `login`, `register` → Flask (`getApiUrl()`). But `getPillarStats`, `getDailyActivity`, `generateNow`, `schedulePost`, `resetDailyLimit` → n8n (`getN8nUrl()`). Two different backend URLs configured independently.
**Why it matters:** For a client's Tauri app, they need to configure TWO server URLs correctly. If either is wrong, parts of the app silently fail with empty data. There's no UI indication which backend a feature depends on.
**Fix:** Route everything through the Flask backend. Have Flask proxy to n8n internally. The client should only need to configure one URL.

### 7. SSE reconnect loop has no backoff or limit
**File:** `src/hooks/useSSE.ts:64-68`
**Problem:** On error, the SSE reconnects after a fixed 5 seconds, forever. If the server is down, this creates an infinite retry loop generating continuous network errors.
**Why it matters:** In a Tauri desktop app that's open all day, this leaks resources, fills the console with errors, and could degrade system performance over time.
**Fix:** Implement exponential backoff (5s → 10s → 20s → 60s max) with a maximum retry count. After N failures, stop and show a "disconnected" indicator.

### 8. PWA code is irrelevant and potentially harmful in Tauri
**File:** `src/components/ServiceWorkerRegistration.tsx`, `src/components/PWAInstallPrompt.tsx`, `src/app/layout.tsx:44-45`, `src/app/manifest.ts`, `public/sw.js`
**Problem:** Service worker registration, PWA install prompts, and web app manifest are all loaded in every page. In a Tauri webview, `beforeinstallprompt` never fires, but the service worker still registers and intercepts fetch requests. The SW's fetch handler at `sw.js:13` checks for `url.hostname === 'localhost'` — this could break if the API server is on a different host.
**Why it matters:** Service workers in Tauri webviews can cause stale caching, unexpected fetch interception, and debugging nightmares. The PWA install prompt adds dead code to every render.
**Fix:** Conditionally load PWA code only when not in Tauri. Check `window.__TAURI__` to detect Tauri environment. Better: remove all PWA code entirely for the Tauri build.

### 9. `console.log` statements leak sensitive data
**File:** `src/lib/api.ts:15-16` (API URL), `src/lib/api.ts:20` (API URL), `src/lib/api.ts:69` (JSON response text), `src/app/scheduled/page.tsx:101` (schedule debug with dates), `src/components/ui/PostCard.tsx:61` (schedule ISO), `src/components/ui/PostCard.tsx:118-125` (full schedule debug object)
**Problem:** Multiple `console.log` and `console.error` statements log API URLs, response bodies, and scheduling data. The PostCard at line 118 logs `selectedDate`, `selectedTime`, `customTime`, `timeStr`, `dateStr`, `isoStr` in a debug object.
**Why it matters:** In a shipped Tauri app, users can open dev tools and see all of this. Not a crash, but unprofessional and potentially leaks internal API structure.
**Fix:** Remove all `console.log` calls from production code. Use a debug flag or strip them at build time.

### 10. No route protection on `/onboarding`
**File:** `src/app/LayoutWrapper.tsx:24`
**Problem:** `publicPages` includes `/onboarding`, meaning the onboarding page renders without auth checks from the layout. The page itself checks `auth.isLoggedIn()`, but there's a race condition — the `useEffect` in `LayoutWrapper` (line 27-30) runs after render, so the page briefly renders unauthenticated.
**Why it matters:** Onboarding sends `updateProfile()` with LinkedIn credentials. It must require auth.
**Fix:** Remove `/onboarding` from `publicPages`. It should be auth-protected.

---

## 🟡 Medium Priority — Should Fix

### 11. `schedulePost()` silently succeeds on failure
**File:** `src/lib/api.ts:263-271`
**Problem:** The catch block explicitly says `// Endpoint may not exist yet - fail silently` and returns `{ status: 'ok' }`. The user sees a success toast even though the post was never scheduled.
**Why it matters:** Silent false positives are worse than errors. The user thinks their post is scheduled when it isn't.
**Fix:** Throw the error and let the UI show a failure toast.

### 12. Sheet component uses hardcoded white background
**File:** `src/components/ui/Sheet.tsx:39`
**Problem:** The sheet uses `bg-white` and `border-gray-200` — these are light-mode colors that clash with the dark theme.
**Why it matters:** Every bottom sheet (schedule picker, edit post) renders with a white background against a dark app. Looks broken.
**Fix:** Use `bg-surface` and `border-stroke` to match the dark theme.

### 13. SkeletonCard and EmptyState use light-mode colors
**File:** `src/components/ui/SkeletonCard.tsx:5` (`bg-white`, `border-gray-200`, `bg-gray-200`), `src/components/ui/EmptyState.tsx:18-22` (`bg-gray-100`, `text-gray-400`, `text-gray-900`, `text-gray-500`)
**Problem:** Hardcoded light-mode colors that don't match the dark theme at all.
**Why it matters:** Loading and empty states look like they belong to a different app.
**Fix:** Use theme tokens (`bg-surface`, `bg-surface-2`, `text-text-primary`, `text-muted`, `border-stroke`).

### 14. `getStats()` returns hardcoded default plan data
**File:** `src/lib/api.ts:111-126`
**Problem:** When the API is unreachable, `getStats()` returns `daily_post_limit: 3`, `plan_name: 'Starter'`, `can_generate_now: true`. The user sees a functional-looking dashboard with fake plan info.
**Why it matters:** User might think they're on Starter plan and can generate posts, when actually the server is just down.
**Fix:** Add an `error` or `offline` flag to the default stats so the UI can indicate the data isn't real.

### 15. Multiple `useEffect` with empty dependency arrays in content/analytics pages
**File:** `src/app/content/page.tsx:23-29` (two side-by-side useEffects both call `fetchStats`), `src/app/content/page.tsx:33-41` (third useEffect for visibility), `src/app/analytics/page.tsx:18-20` (depends on `period` but `fetchAnalytics` doesn't use `period`)
**Problem:** Content page has 3 separate useEffects that all trigger on mount, and two of them both call `fetchStats`. The analytics page has `period` in the dependency array but the `fetchAnalytics` function doesn't filter by period — it always fetches the same data.
**Why it matters:** Wasted API calls on mount. Period selector in analytics is pure UI theater — changing it doesn't change the data.
**Fix:** Consolidate into one useEffect. Make analytics actually filter by period, or remove the period selector.

### 16. `publishNow()` returns `{ status: 'error' }` instead of throwing
**File:** `src/lib/api.ts:349-353`
**Problem:** On failure, `publishNow` returns `{ status: 'error' }` but the caller in `scheduled/page.tsx:131` doesn't check for this — it only catches thrown errors.
**Why it matters:** If publish fails due to a network error, the user sees no error feedback.
**Fix:** Either throw on error (consistent with `submitDecision`) or have callers check the return status.

### 17. `pg` package in frontend dependencies
**File:** `dashboard/package.json:13`
**Problem:** `pg` (PostgreSQL client) and `@types/pg` are listed as frontend dependencies. A Next.js static export (`output: 'export'`) cannot use server-side database access.
**Why it matters:** Inflates bundle size with a Node-only package that can never be used in the browser or Tauri webview.
**Fix:** Remove `pg` and `@types/pg` from dependencies.

---

## 🔵 Low Priority / Good to Know

### 18. Manifest still says "PostFlow" not "Qalam"
**File:** `src/app/manifest.ts:7-8`, `src/app/layout.tsx:38` (`apple-mobile-web-app-title` says "PostFlow"), `src/components/PWAInstallPrompt.tsx:55` ("Install PostFlow")
**Problem:** The app was rebranded to "Qalam" but PWA manifest, meta tags, and install prompt still reference "PostFlow".
**Fix:** Update to "Qalam" or remove PWA code entirely.

### 19. `analytics/page.tsx` daily chart uses `Math.random()` for data
**File:** `src/app/analytics/page.tsx:156-158`
**Problem:** Bar chart values are `Math.floor(Math.random() * 5)` — pure random data that changes on every render.
**Why it matters:** Users see random data that changes every time they look at the page. Looks buggy.
**Fix:** Wire up to `api.getDailyActivity()` (the method already exists) or remove the chart.

### 20. `calcHealthScore` always gives 25 free points
**File:** `src/lib/utils.ts:74`
**Problem:** The "no failed posts" check always adds 25 points with comment `// Default since we don't track failed in Stats interface`.
**Why it matters:** Health score is inflated. A user with 0 generated, 0 approved, 0 published still gets 25/100.
**Fix:** Either track failed posts or remove that criterion.

### 21. `window.location.href` for navigation in `auth.logout()`
**File:** `src/lib/auth.ts:36`
**Problem:** `window.location.href = '/login'` does a full page reload. In login page (line 49) same pattern: `window.location.href = '/queue'`.
**Why it matters:** In Tauri, full page reloads are slower than SPA navigation. Also resets all React state, SSE connections, etc.
**Fix:** Use Next.js router for navigation where possible. For logout specifically, a full reload is defensible (clears all state), but document the intent.

### 22. `useToast` is not shared — each page has its own instance
**File:** `src/hooks/useToast.ts`, `src/app/queue/page.tsx:11`, `src/app/content/page.tsx:7`, `src/app/analytics/page.tsx:8`
**Problem:** `useToast()` creates local state per component. But `LayoutWrapper` also calls `useToast()` at line 20 and renders a `ToastContainer`. The page-level toasts won't appear in the layout's container — they're separate state.
**Why it matters:** Toast notifications from individual pages are invisible since the `ToastContainer` in `LayoutWrapper` has its own separate toast list that never gets populated by child pages.
**Fix:** Move toast state to a shared context (like `AppContext`) or use a global event bus.

### 23. Tailwind color overrides make standard classes unpredictable
**File:** `src/app/globals.css:3-55`
**Problem:** The theme overrides standard Tailwind colors (`blue-100` → `#1a1400`, `green-50` → `#0a1a0a`, `gray-900` → `#f0e5da`). Any component using standard Tailwind color classes will get unexpected dark-theme colors instead of the standard ones. This already caused the Health Score card issue and affects SkeletonCard, EmptyState, Sheet, and pillar color badges.
**Why it matters:** Makes debugging CSS extremely confusing. Any new developer (or AI) using standard classes will get wrong colors.
**Fix:** Use custom token names (`--color-brand-*`) instead of overriding standard Tailwind color names. Keep standard colors intact.

### 24. No Tauri config files exist yet
**Problem:** Despite the CLAUDE.md stating "this frontend is being packaged as a Tauri desktop application," there are no `src-tauri/` directory, `tauri.conf.json`, or Cargo.toml files.
**Why it matters:** The Tauri-specific concerns raised above are preparatory — none of the Tauri integration has actually been built yet.
**Fix:** When you add Tauri, address items 1, 5, 7, 8, and 21 as part of that work.
