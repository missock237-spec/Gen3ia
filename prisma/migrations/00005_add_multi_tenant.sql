-- Migration 00005: Multi-Tenant, Webhook Logs & Plugin Store

-- Table: tenants
CREATE TABLE IF NOT EXISTS tenants (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    slug                TEXT NOT NULL UNIQUE,
    plan                TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
    settings            TEXT NOT NULL DEFAULT '{}',
    features            TEXT NOT NULL DEFAULT '[]',
    max_agents          INTEGER NOT NULL DEFAULT 5,
    max_users           INTEGER NOT NULL DEFAULT 3,
    max_storage_mb      INTEGER NOT NULL DEFAULT 100,
    max_api_calls_per_day INTEGER NOT NULL DEFAULT 1000,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_plan ON tenants(plan);

-- Table: tenant_members
CREATE TABLE IF NOT EXISTS tenant_members (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
    invited_by  TEXT,
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, user_id)
);

CREATE INDEX idx_tenant_members_tenant ON tenant_members(tenant_id);
CREATE INDEX idx_tenant_members_user ON tenant_members(user_id);

-- Table: webhook_logs
CREATE TABLE IF NOT EXISTS webhook_logs (
    id              TEXT PRIMARY KEY,
    webhook_id      TEXT,
    webhook_url     TEXT NOT NULL,
    event           TEXT NOT NULL,
    attempt         INTEGER NOT NULL DEFAULT 1,
    status_code     INTEGER,
    duration_ms     INTEGER NOT NULL DEFAULT 0,
    success         BOOLEAN NOT NULL DEFAULT false,
    error_message   TEXT,
    response_body   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_logs_webhook ON webhook_logs(webhook_id);
CREATE INDEX idx_webhook_logs_created ON webhook_logs(created_at);

-- Table: api_usage (rate limiting)
CREATE TABLE IF NOT EXISTS api_usage (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint    TEXT NOT NULL,
    method      TEXT NOT NULL DEFAULT 'GET',
    status_code INTEGER,
    duration_ms INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_usage_tenant ON api_usage(tenant_id, created_at);
CREATE INDEX idx_api_usage_user ON api_usage(user_id, created_at);

-- Ajout colonne tenant_id aux tables existantes
ALTER TABLE agents ADD COLUMN IF NOT EXISTS tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agents_tenant ON agents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_tenant ON conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_uploads_tenant ON uploads(tenant_id);
