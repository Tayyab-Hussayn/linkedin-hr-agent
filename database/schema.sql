-- Qalam Database Schema (PostgreSQL 16)
-- Single source of truth for initializing a fresh Qalam database.
-- Run once: docker exec -i la_postgres psql -U hragent -d linkedin_agent < database/schema.sql
--
-- Last synced with live DB: 2026-04-16
--
-- Tables: clients, plans, users, client_profiles, posts, engagement_log,
--         analytics_reports, feedback
-- Views:  client_effective_limits
-- Funcs:  cleanup_posts()

-- ─── Extensions ──────────────────────────────────────────────────────────────
-- gen_random_uuid() is provided by pgcrypto in older PG versions; in PG 13+
-- it's available in the core catalog, so no extension required.

-- ─── plans ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plans (
  id                   VARCHAR(50) PRIMARY KEY,
  name                 VARCHAR(100) NOT NULL,
  description          TEXT,
  daily_post_limit     INTEGER NOT NULL DEFAULT 3,
  monthly_post_limit   INTEGER NOT NULL DEFAULT 90,
  max_topic_pillars    INTEGER NOT NULL DEFAULT 3,
  can_schedule         BOOLEAN DEFAULT TRUE,
  can_custom_time      BOOLEAN DEFAULT FALSE,
  can_edit_posts       BOOLEAN DEFAULT TRUE,
  can_analytics        BOOLEAN DEFAULT FALSE,
  can_generate_now     BOOLEAN DEFAULT FALSE,
  ai_model             VARCHAR(50) DEFAULT 'gemini-flash',
  max_post_length      INTEGER DEFAULT 1500,
  max_publishing_slots INTEGER DEFAULT 1,
  price_monthly        NUMERIC(10, 2) DEFAULT 0,
  is_active            BOOLEAN DEFAULT TRUE,
  created_at           TIMESTAMP DEFAULT NOW()
);

-- ─── clients ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  slack_user_id        TEXT UNIQUE,
  linkedin_email       TEXT,
  linkedin_password    TEXT,
  timezone             TEXT DEFAULT 'UTC',
  content_mode         TEXT DEFAULT 'ai_suggested',
  active_hours_start   TEXT DEFAULT '08:00',
  active_hours_end     TEXT DEFAULT '19:00',
  is_active            BOOLEAN DEFAULT TRUE,
  created_at           TIMESTAMP DEFAULT NOW(),
  updated_at           TIMESTAMP,
  daily_post_limit     INTEGER DEFAULT 3,
  publishing_slots     JSONB DEFAULT '["18:00"]'::jsonb,
  plan_id              VARCHAR(50) DEFAULT 'starter' REFERENCES plans(id),
  limit_override_daily INTEGER,
  niche                VARCHAR(100) DEFAULT 'hr_professional',
  job_title            VARCHAR(100),
  tone                 TEXT,
  target_audience      TEXT,
  writing_style        TEXT,
  sample_posts         JSONB DEFAULT '[]'::jsonb,
  avoid_topics         JSONB DEFAULT '[]'::jsonb,
  content_language     VARCHAR(10) DEFAULT 'en',
  years_experience     INTEGER DEFAULT 5,
  company_name         VARCHAR(100),
  unique_angle         TEXT,
  topic_pillars        JSONB DEFAULT '[]'::jsonb,
  post_formats         JSONB DEFAULT '["story", "insight", "tips", "controversial"]'::jsonb,
  auto_gen_enabled     BOOLEAN DEFAULT TRUE
);

-- ─── users (JWT auth) ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          VARCHAR(255) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  client_id      VARCHAR(50) REFERENCES clients(id),
  role           VARCHAR(20) DEFAULT 'client',
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  last_login     TIMESTAMPTZ
);

-- ─── client_profiles ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_profiles (
  id               TEXT PRIMARY KEY,
  client_id        TEXT UNIQUE REFERENCES clients(id),
  cv_raw_text      TEXT,
  headline         TEXT,
  summary          TEXT,
  experience       JSONB DEFAULT '[]'::jsonb,
  skills           JSONB DEFAULT '[]'::jsonb,
  education        JSONB DEFAULT '[]'::jsonb,
  tone_profile     JSONB,
  content_strategy JSONB,
  sample_posts     JSONB DEFAULT '[]'::jsonb,
  updated_at       TIMESTAMP DEFAULT NOW()
);

-- ─── posts ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS posts (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        TEXT REFERENCES clients(id),
  content          TEXT NOT NULL,
  post_format      TEXT DEFAULT 'text',
  topic_pillar     TEXT,
  approval_status  TEXT DEFAULT 'pending',
  post_status      TEXT DEFAULT 'draft',
  scheduled_for    TIMESTAMP,
  published_at     TIMESTAMP,
  created_at       TIMESTAMP DEFAULT NOW(),
  approved_at      TIMESTAMP,
  approval_note    TEXT,
  retry_count      INTEGER DEFAULT 0,
  next_retry_at    TIMESTAMP
);

-- ─── post_images ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_images (
    id            TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id       TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    filename      TEXT NOT NULL,
    original_name TEXT,
    mime_type     TEXT NOT NULL,
    size_bytes    INTEGER NOT NULL,
    sort_order    INTEGER DEFAULT 0,
    created_at    TIMESTAMP DEFAULT NOW()
);

-- ─── engagement_log ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS engagement_log (
  id               TEXT PRIMARY KEY,
  client_id        TEXT REFERENCES clients(id),
  engagement_type  TEXT,
  target_post_url  TEXT,
  reaction_type    TEXT,
  comment_text     TEXT,
  executed_at      TIMESTAMP DEFAULT NOW()
);

-- ─── analytics_reports ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS analytics_reports (
  id                TEXT PRIMARY KEY,
  client_id         TEXT REFERENCES clients(id),
  report_type       TEXT DEFAULT 'weekly',
  period_start      TIMESTAMP,
  period_end        TIMESTAMP,
  generated_count   INTEGER DEFAULT 0,
  approved_count    INTEGER DEFAULT 0,
  published_count   INTEGER DEFAULT 0,
  rejected_count    INTEGER DEFAULT 0,
  approval_rate     INTEGER DEFAULT 0,
  health_score      INTEGER DEFAULT 0,
  created_at        TIMESTAMP DEFAULT NOW()
);

-- ─── feedback (error reports + ratings) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS feedback (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     VARCHAR(50),
  type          VARCHAR(20) NOT NULL,  -- 'error' | 'rating'
  rating        INTEGER,                -- 1-5 for type='rating'
  message       TEXT,
  error_details JSONB,
  app_version   TEXT,
  os_info       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clients_slack_user       ON clients(slack_user_id);
CREATE INDEX IF NOT EXISTS idx_client_profiles_client   ON client_profiles(client_id);
CREATE INDEX IF NOT EXISTS idx_posts_client             ON posts(client_id);
CREATE INDEX IF NOT EXISTS idx_posts_status             ON posts(post_status);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled          ON posts(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_engagement_client        ON engagement_log(client_id);
CREATE INDEX IF NOT EXISTS idx_engagement_executed      ON engagement_log(executed_at);
-- Composite index for the worker's hot due-posts query (Q4 audit fix).
CREATE INDEX IF NOT EXISTS idx_posts_queue
    ON posts(client_id, approval_status, post_status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_post_images_post_id ON post_images(post_id);

-- ─── View: client_effective_limits ────────────────────────────────────────────
CREATE OR REPLACE VIEW client_effective_limits AS
SELECT
  c.id                                               AS client_id,
  c.name                                             AS client_name,
  c.plan_id,
  p.name                                             AS plan_name,
  COALESCE(c.limit_override_daily, p.daily_post_limit) AS daily_post_limit,
  p.monthly_post_limit,
  p.max_topic_pillars,
  p.can_schedule,
  p.can_custom_time,
  p.can_analytics,
  p.can_generate_now,
  p.ai_model,
  p.max_post_length,
  p.max_publishing_slots,
  p.price_monthly,
  c.publishing_slots
FROM clients c
JOIN plans p ON p.id = c.plan_id;

-- ─── Function: cleanup_posts() ────────────────────────────────────────────────
-- Called by the worker /api/worker/cleanup endpoint.
CREATE OR REPLACE FUNCTION cleanup_posts() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- 1. Auto-reject stale pending posts older than 7 days
  UPDATE posts
  SET approval_status = 'rejected',
      post_status     = 'skipped',
      approval_note   = 'Auto-rejected: stale pending post'
  WHERE approval_status = 'pending'
    AND created_at < NOW() - INTERVAL '7 days';

  -- 2. Mark exhausted retries as permanently failed
  UPDATE posts
  SET post_status   = 'failed',
      approval_note = 'Max retries exhausted'
  WHERE approval_status = 'approved'
    AND post_status = 'draft'
    AND retry_count >= 3
    AND scheduled_for < NOW() - INTERVAL '1 hour';

  -- 3. Delete rejected/skipped posts older than 30 days
  DELETE FROM posts
  WHERE approval_status = 'rejected'
    AND post_status = 'skipped'
    AND created_at < NOW() - INTERVAL '30 days';
END;
$$;
