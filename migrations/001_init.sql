-- Feed Engine module schema migration
-- Run once on first startup

-- Create isolated schema for this module
CREATE SCHEMA IF NOT EXISTS feed;

-- Feed sync state (replaces public.feed_sync_state from monolith)
CREATE TABLE IF NOT EXISTS feed.feed_sync_state (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feed_name       TEXT UNIQUE NOT NULL,
    last_cursor     TEXT,
    last_sync_at    TIMESTAMPTZ,
    last_sync_count INTEGER DEFAULT 0,
    last_error      TEXT,
    error_count     INTEGER DEFAULT 0,
    total_ingested  INTEGER DEFAULT 0,
    is_enabled      BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Per-feed configuration
CREATE TABLE IF NOT EXISTS feed.feed_config (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feed_name              TEXT UNIQUE NOT NULL,
    poll_interval_minutes  INTEGER DEFAULT 60,
    is_enabled             BOOLEAN DEFAULT TRUE,
    config                 JSONB DEFAULT '{}',
    created_at             TIMESTAMPTZ DEFAULT NOW(),
    updated_at             TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial feed state rows
INSERT INTO feed.feed_sync_state (feed_name) VALUES
    ('nvd'), ('kev'), ('urlhaus'), ('otx'), ('threatfox'),
    ('malwarebazaar'), ('virustotal'), ('shodan'), ('abuseipdb'),
    ('cisa_advisories'), ('exploitdb'), ('mitre_attack')
ON CONFLICT (feed_name) DO NOTHING;
