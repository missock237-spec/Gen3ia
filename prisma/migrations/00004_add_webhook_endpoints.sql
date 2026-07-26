-- ============================================================
-- Migration 00004: Webhook Endpoints configurables
-- Pour envoyer des notifications vers des URLs externes
-- ============================================================

-- Table des webhooks sortants configurables
CREATE TABLE IF NOT EXISTS "webhook_endpoints" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "name" TEXT NOT NULL,
    "description" TEXT DEFAULT '',
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL DEFAULT '',
    "events" TEXT NOT NULL DEFAULT '[]',  -- Liste JSON des evenements, '*' = tous
    "headers" TEXT NOT NULL DEFAULT '{}', -- Headers personnalises JSON
    "retryConfig" TEXT NOT NULL DEFAULT '{"maxRetries":3,"backoffMs":1000}',
    "timeoutMs" INTEGER NOT NULL DEFAULT 10000,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" TIMESTAMP WITH TIME ZONE,
    "lastResponseStatus" INTEGER,
    "lastError" TEXT,
    "deliveryCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS "idx_webhook_endpoints_user_id" ON "webhook_endpoints"("userId");
CREATE INDEX IF NOT EXISTS "idx_webhook_endpoints_events" ON "webhook_endpoints" USING gin ("events");
CREATE INDEX IF NOT EXISTS "idx_webhook_endpoints_is_active" ON "webhook_endpoints"("isActive");
CREATE INDEX IF NOT EXISTS "idx_webhook_endpoints_user_active" ON "webhook_endpoints"("userId", "isActive");

-- Table de log des livraisons
CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "webhookId" TEXT NOT NULL REFERENCES "webhook_endpoints"("id") ON DELETE CASCADE,
    "event" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "status" TEXT NOT NULL DEFAULT 'pending',  -- pending, delivered, failed, retrying
    "errorMessage" TEXT,
    "deliveredAt" TIMESTAMP WITH TIME ZONE,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_webhook_deliveries_webhook_id" ON "webhook_deliveries"("webhookId");
CREATE INDEX IF NOT EXISTS "idx_webhook_deliveries_status" ON "webhook_deliveries"("status");
CREATE INDEX IF NOT EXISTS "idx_webhook_deliveries_created" ON "webhook_deliveries"("createdAt" DESC);

-- Trigger pour updatedAt automatique
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_webhook_endpoints_updated_at
    BEFORE UPDATE ON "webhook_endpoints"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
