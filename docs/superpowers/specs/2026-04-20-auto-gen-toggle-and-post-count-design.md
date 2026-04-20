# Auto-Gen Toggle Persistence & Post Count Fix

**Date:** 2026-04-20  
**Status:** Approved — implementing

---

## Problem

1. **Toggle doesn't persist:** User disables auto-generation, but the next scheduled n8n run generates posts anyway. The n8n "Decide Generation Plan" code node never checks `auto_gen_enabled`, so it ignores the user's preference.
2. **Over-generates:** Morning runs generate 2 posts, evening runs generate 1. User wants exactly 1 post per run regardless of time of day.

---

## Architecture Context

```
n8n cron (8AM/6PM)
  → Fetch Active Clients (direct DB: SELECT from clients)
  → Check Posts Today (direct DB)
  → Decide Generation Plan (JS code node) ← BOTH bugs live here
  → Build Generation Prompt → Flask /api/client-profile/{id}
  → AI generates content
  → Save Posts to DB (direct DB INSERT)
  → Flask /api/notify (SSE broadcast)

Dashboard "Generate Now" button
  → Flask POST /api/generate-now
  → n8n webhook /webhook/generate-now
```

n8n accesses PostgreSQL directly — it does NOT call Flask before generating. Flask is only called for `client-profile` (prompt building) and `notify` (SSE).

---

## Changes

### CHANGE 1 — Post count: always 1 per run (n8n "Decide Generation Plan" node)

```js
// Remove morning/evening distinction
// Before:
const isMorningRun = currentHour < 14;
const targetCount = isMorningRun ? Math.min(2, remaining) : Math.min(1, remaining);

// After:
const targetCount = Math.min(1, remaining);
```

### CHANGE 2 — Respect auto_gen_enabled (n8n "Decide Generation Plan" node)

Add at the top of the decision logic, before the daily limit check:

```js
const autoGenEnabled = clientData.auto_gen_enabled;
if (autoGenEnabled === false) {
  return [{ json: {
    skip: true,
    reason: 'Auto-generation disabled by user',
    client_id: clientData.client_id
  }}];
}
```

### CHANGE 3 — Fetch auto_gen_enabled in DB query (n8n "Fetch Active Clients" node)

Add `COALESCE(c.auto_gen_enabled, true) as auto_gen_enabled` to SELECT.

### CHANGE 4 — Gate Flask /api/generate-now (action_server.py)

Block manual "Generate Now" when `auto_gen_enabled = false`. Check DB before calling n8n webhook.

---

## Testing

- n8n: Execute workflow 02 manually → verify only 1 post generated, skipped if auto_gen_enabled=false
- Flask: `curl -X POST http://localhost:5050/api/generate-now` with disabled client → expect 403
- Dashboard: Toggle off → verify UI shows paused → refresh → still paused
