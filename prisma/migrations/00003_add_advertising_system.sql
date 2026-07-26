-- ============================================================
-- Advertising System — Modèles de données pour le système
-- de publicité dans les conversations
-- ============================================================

-- Campagnes publicitaires
CREATE TABLE IF NOT EXISTS "ad_campaigns" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "advertiser_name" TEXT NOT NULL,
    "advertiser_url" TEXT NOT NULL DEFAULT '',
    "image_url" TEXT NOT NULL DEFAULT '',
    "text_content" TEXT NOT NULL,
    "cta_text" TEXT NOT NULL DEFAULT 'En savoir plus',
    "cta_url" TEXT NOT NULL,
    "target_audience" TEXT NOT NULL DEFAULT 'all',
    "target_plan" TEXT NOT NULL DEFAULT 'all',
    "max_impressions" INT NOT NULL DEFAULT 0,
    "max_clicks" INT NOT NULL DEFAULT 0,
    "reward_per_view" FLOAT NOT NULL DEFAULT 0,
    "reward_per_click" FLOAT NOT NULL DEFAULT 0,
    "cost_per_view" FLOAT NOT NULL DEFAULT 0.001,
    "cost_per_click" FLOAT NOT NULL DEFAULT 0.01,
    "budget_total" FLOAT NOT NULL DEFAULT 0,
    "budget_spent" FLOAT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "start_at" TIMESTAMPTZ,
    "end_at" TIMESTAMPTZ,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Impressions publicitaires (vues)
CREATE TABLE IF NOT EXISTS "ad_impressions" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "campaign_id" TEXT NOT NULL REFERENCES "ad_campaigns"("id") ON DELETE CASCADE,
    "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "session_id" TEXT NOT NULL DEFAULT '',
    "conversation_id" TEXT,
    "ad_type" TEXT NOT NULL DEFAULT 'unrewarded',
    "viewed_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "view_duration_ms" INT NOT NULL DEFAULT 0,
    "was_clicked" BOOLEAN NOT NULL DEFAULT false,
    "clicked_at" TIMESTAMPTZ,
    "reward_credited" BOOLEAN NOT NULL DEFAULT false,
    "reward_amount" FLOAT NOT NULL DEFAULT 0,
    "ip_address" TEXT,
    "user_agent" TEXT
);

-- Préférences utilisateur pour les publicités
CREATE TABLE IF NOT EXISTS "ad_user_preferences" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "user_id" TEXT NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
    "ads_enabled" BOOLEAN NOT NULL DEFAULT true,
    "rewarded_ads_enabled" BOOLEAN NOT NULL DEFAULT false,
    "total_credits_earned" FLOAT NOT NULL DEFAULT 0,
    "total_ads_viewed" INT NOT NULL DEFAULT 0,
    "total_ads_clicked" INT NOT NULL DEFAULT 0,
    "last_ad_viewed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_status ON "ad_campaigns"("status", "is_active");
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_dates ON "ad_campaigns"("start_at", "end_at");
CREATE INDEX IF NOT EXISTS idx_ad_impressions_user ON "ad_impressions"("user_id", "viewed_at");
CREATE INDEX IF NOT EXISTS idx_ad_impressions_campaign ON "ad_impressions"("campaign_id", "viewed_at");
CREATE INDEX IF NOT EXISTS idx_ad_impressions_reward ON "ad_impressions"("reward_credited", "ad_type");
