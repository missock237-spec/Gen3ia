-- ============================================================
-- Migration: Ajout des index manquants sur userId, status, createdAt
-- Améliore les performances des requêtes de listing et pagination
-- ============================================================

-- Index composés pour les listings paginés
CREATE INDEX IF NOT EXISTS idx_agents_user_status ON "agents"("user_id", "status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON "conversations"("user_id", "updated_at" DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON "messages"("conversation_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS idx_workflows_user_status ON "workflows"("user_id", "status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_workflow_status ON "tasks"("workflow_id", "status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS idx_agent_executions_user_status ON "agent_executions"("user_id", "status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS idx_agent_executions_agent_status ON "agent_executions"("agent_id", "status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_type ON "credit_transactions"("user_id", "type", "created_at" DESC);
CREATE INDEX IF NOT EXISTS idx_voice_calls_user_status ON "voice_calls"("user_id", "status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS idx_image_generations_user_status ON "image_generations"("user_id", "status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS idx_video_generations_user_status ON "video_generations"("user_id", "status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_type_status ON "marketplace_listings"("type", "status", "created_at" DESC);
CREATE INDEX IF NOT EXISTS idx_connector_executions_user_type ON "connector_executions"("user_id", "connector_type", "created_at" DESC);
CREATE INDEX IF NOT EXISTS idx_agent_memories_user_category ON "agent_memories"("user_id", "category", "created_at" DESC);
CREATE INDEX IF NOT EXISTS idx_ai_costs_user_provider ON "ai_costs"("user_id", "provider", "created_at" DESC);
CREATE INDEX IF NOT EXISTS idx_ad_impressions_user_campaign ON "ad_impressions"("user_id", "campaign_id", "viewed_at" DESC);
