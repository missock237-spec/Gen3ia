-- Migration: Add ConnectedIntegration for n8n automatic connector system
-- Ce modèle permet de lier les comptes utilisateurs aux credentials n8n

CREATE TABLE IF NOT EXISTS "connected_integrations" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "service" TEXT NOT NULL,
    "credential_id" TEXT NOT NULL DEFAULT '',
    "credential_name" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'connected',
    "last_tested_at" TIMESTAMPTZ,
    "last_test_result" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE("user_id", "service")
);

CREATE INDEX IF NOT EXISTS idx_connected_integrations_user_id ON "connected_integrations"("user_id");
CREATE INDEX IF NOT EXISTS idx_connected_integrations_service ON "connected_integrations"("service");
