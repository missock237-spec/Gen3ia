CREATE TABLE IF NOT EXISTS relay_usage (
    id              TEXT PRIMARY KEY,
    provider        TEXT NOT NULL,
    modality        TEXT NOT NULL,
    daily_count     INTEGER NOT NULL DEFAULT 0,
    monthly_count   INTEGER NOT NULL DEFAULT 0,
    total_count     INTEGER NOT NULL DEFAULT 0,
    last_reset_date DATE NOT NULL DEFAULT CURRENT_DATE,
    last_reset_month DATE NOT NULL DEFAULT DATE_TRUNC('month', CURRENT_DATE),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider, modality)
);
CREATE INDEX IF NOT EXISTS idx_relay_usage_provider ON relay_usage(provider);
CREATE INDEX IF NOT EXISTS idx_relay_usage_modality ON relay_usage(modality);
CREATE INDEX IF NOT EXISTS idx_relay_usage_reset ON relay_usage(last_reset_date);