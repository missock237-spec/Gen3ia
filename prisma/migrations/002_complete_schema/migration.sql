-- Migration 002: Complete le schema avec toutes les tables manquantes
-- Tables: guardrails, validations, browser, whatsapp, conversations, messages, knowledge,
-- documents, chunks, activity, ai_costs, monitoring, blocklist, audit, media, voice,
-- avatars, multimodal, memory_graph, billing, workspaces, marketplace, personalization, connectors

-- ==========================================
-- WORKFLOWS, TASKS & GUARDRAILS
-- ==========================================

CREATE TABLE IF NOT EXISTS "workflows" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "steps" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "currentTaskIndex" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workflows_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "workflows_userId_idx" ON "workflows"("userId");

CREATE TABLE IF NOT EXISTS "tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "result" TEXT,
    "agentId" TEXT,
    "workflowId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tasks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "tasks_workflowId_idx" ON "tasks"("workflowId");
CREATE INDEX IF NOT EXISTS "tasks_userId_idx" ON "tasks"("userId");

CREATE TABLE IF NOT EXISTS "guardrails" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "rules" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "guardrails_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "guardrails_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "guardrails_userId_idx" ON "guardrails"("userId");

CREATE TABLE IF NOT EXISTS "validations" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "guardrailId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "validations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "validations_guardrailId_fkey" FOREIGN KEY ("guardrailId") REFERENCES "guardrails"("id") ON DELETE CASCADE,
    CONSTRAINT "validations_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "validations_guardrailId_idx" ON "validations"("guardrailId");
CREATE INDEX IF NOT EXISTS "validations_taskId_idx" ON "validations"("taskId");

-- ==========================================
-- BROWSER
-- ==========================================

CREATE TABLE IF NOT EXISTS "browser_sessions" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "url" TEXT NOT NULL DEFAULT 'about:blank',
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "screenshot" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "browser_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "browser_sessions_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE,
    CONSTRAINT "browser_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "browser_sessions_userId_idx" ON "browser_sessions"("userId");
CREATE INDEX IF NOT EXISTS "browser_sessions_status_idx" ON "browser_sessions"("status");

CREATE TABLE IF NOT EXISTS "browser_automations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT,
    "url" TEXT NOT NULL DEFAULT 'about:blank',
    "title" TEXT,
    "actions" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'idle',
    "screenshots" TEXT NOT NULL DEFAULT '[]',
    "result" TEXT DEFAULT '{}',
    "error" TEXT,
    "stepCount" INTEGER NOT NULL DEFAULT 0,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "browser_automations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "browser_automations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "browser_automations_userId_idx" ON "browser_automations"("userId");
CREATE INDEX IF NOT EXISTS "browser_automations_status_idx" ON "browser_automations"("status");

-- ==========================================
-- WHATSAPP
-- ==========================================

CREATE TABLE IF NOT EXISTS "whatsapp_configs" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "whatsappId" TEXT,
    "phoneNumberId" TEXT,
    "apiToken" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "autoMessage" BOOLEAN NOT NULL DEFAULT false,
    "autoCall" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "whatsapp_configs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "whatsapp_configs_userId_key" UNIQUE ("userId"),
    CONSTRAINT "whatsapp_configs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "whatsapp_configs_isActive_idx" ON "whatsapp_configs"("isActive");

-- ==========================================
-- CONVERSATIONS
-- ==========================================

CREATE TABLE IF NOT EXISTS "conversations" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'chat',
    "userId" TEXT NOT NULL,
    "agentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "conversations_userId_createdAt_idx" ON "conversations"("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "messages" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT,
    "provider" TEXT,
    "conversationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");

-- ==========================================
-- KNOWLEDGE & DOCUMENTS
-- ==========================================

CREATE TABLE IF NOT EXISTS "knowledge" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "relevance" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "knowledge_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "knowledge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "knowledge_userId_category_idx" ON "knowledge"("userId", "category");
CREATE INDEX IF NOT EXISTS "knowledge_userId_createdAt_idx" ON "knowledge"("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "documents" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL DEFAULT 'unknown',
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "content" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'processing',
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "documents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "documents_userId_createdAt_idx" ON "documents"("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "document_chunks" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL DEFAULT 0,
    "pageNumber" INTEGER,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "document_chunks_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE,
    CONSTRAINT "document_chunks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "document_chunks_documentId_idx" ON "document_chunks"("documentId");
CREATE INDEX IF NOT EXISTS "document_chunks_userId_idx" ON "document_chunks"("userId");

-- ==========================================
-- ACTIVITY & MONITORING
-- ==========================================

CREATE TABLE IF NOT EXISTS "activity_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "activity_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "activity_logs_userId_createdAt_idx" ON "activity_logs"("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "ai_costs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_costs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ai_costs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "ai_costs_userId_createdAt_idx" ON "ai_costs"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ai_costs_provider_createdAt_idx" ON "ai_costs"("provider", "createdAt");

CREATE TABLE IF NOT EXISTS "usage_daily" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "agentCount" INTEGER NOT NULL DEFAULT 0,
    "taskCount" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "totalCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "apiCalls" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "usage_daily_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "usage_daily_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "usage_daily_userId_date_key" ON "usage_daily"("userId", "date");
CREATE INDEX IF NOT EXISTS "usage_daily_userId_date_idx" ON "usage_daily"("userId", "date");

CREATE TABLE IF NOT EXISTS "monitoring_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "details" TEXT NOT NULL DEFAULT '{}',
    "severity" TEXT NOT NULL DEFAULT 'info',
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "monitoring_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "monitoring_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "monitoring_events_userId_createdAt_idx" ON "monitoring_events"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "monitoring_events_eventType_severity_idx" ON "monitoring_events"("eventType", "severity");

-- ==========================================
-- SECURITY
-- ==========================================

CREATE TABLE IF NOT EXISTS "url_blocklist" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "threatType" TEXT NOT NULL DEFAULT 'malware',
    "severity" TEXT NOT NULL DEFAULT 'high',
    "source" TEXT NOT NULL DEFAULT 'system',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "url_blocklist_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "url_blocklist_domain_key" ON "url_blocklist"("domain");
CREATE INDEX IF NOT EXISTS "url_blocklist_isActive_idx" ON "url_blocklist"("isActive");

CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL DEFAULT '',
    "resourceId" TEXT NOT NULL DEFAULT '',
    "details" TEXT NOT NULL DEFAULT '{}',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");
CREATE INDEX IF NOT EXISTS "audit_logs_severity_createdAt_idx" ON "audit_logs"("severity", "createdAt");

-- ==========================================
-- MEDIA GENERATION
-- ==========================================

CREATE TABLE IF NOT EXISTS "image_generations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'openrouter',
    "imageUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "width" INTEGER,
    "height" INTEGER,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "image_generations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "image_generations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "image_generations_userId_createdAt_idx" ON "image_generations"("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "video_generations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 't2v',
    "model" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'cogvideo',
    "videoUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "durationSeconds" DOUBLE PRECISION,
    "width" INTEGER,
    "height" INTEGER,
    "fps" INTEGER,
    "numFrames" INTEGER,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "video_generations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "video_generations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "video_generations_userId_createdAt_idx" ON "video_generations"("userId", "createdAt");

-- ==========================================
-- VOICE
-- ==========================================

CREATE TABLE IF NOT EXISTS "voice_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en-US',
    "voiceModel" TEXT NOT NULL DEFAULT 'alloy',
    "speed" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "pitch" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "volume" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "provider" TEXT NOT NULL DEFAULT 'openai',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" TEXT DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "voice_profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "voice_profiles_userId_key" UNIQUE ("userId"),
    CONSTRAINT "voice_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "voice_calls" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT,
    "provider" TEXT NOT NULL,
    "callSid" TEXT,
    "fromNumber" TEXT NOT NULL,
    "toNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ringing',
    "language" TEXT NOT NULL DEFAULT 'en-US',
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "maxDurationMinutes" INTEGER NOT NULL DEFAULT 30,
    "recordingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "recordingUrl" TEXT,
    "transcript" TEXT NOT NULL DEFAULT '[]',
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "voice_calls_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "voice_calls_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "voice_calls_userId_idx" ON "voice_calls"("userId");
CREATE INDEX IF NOT EXISTS "voice_calls_status_idx" ON "voice_calls"("status");

CREATE TABLE IF NOT EXISTS "voice_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "language" TEXT,
    "sttProvider" TEXT,
    "ttsProvider" TEXT,
    "transcription" TEXT DEFAULT '',
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "voice_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "voice_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "voice_sessions_userId_idx" ON "voice_sessions"("userId");
CREATE INDEX IF NOT EXISTS "voice_sessions_type_idx" ON "voice_sessions"("type");

CREATE TABLE IF NOT EXISTS "voice_memories" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "voiceSessionId" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "content" TEXT NOT NULL,
    "embedding" TEXT,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "language" TEXT NOT NULL DEFAULT 'en-US',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "voice_memories_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "voice_memories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "voice_memories_userId_idx" ON "voice_memories"("userId");
CREATE INDEX IF NOT EXISTS "voice_memories_category_idx" ON "voice_memories"("category");

-- ==========================================
-- AVATARS & MULTIMODAL
-- ==========================================

CREATE TABLE IF NOT EXISTS "avatar_configs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'genova-v1',
    "style" TEXT NOT NULL DEFAULT 'realistic',
    "voiceId" TEXT,
    "expressions" TEXT NOT NULL DEFAULT '[]',
    "animations" TEXT NOT NULL DEFAULT '[]',
    "customData" TEXT NOT NULL DEFAULT '{}',
    "thumbnailUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "avatar_configs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "avatar_configs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "avatar_configs_userId_idx" ON "avatar_configs"("userId");

CREATE TABLE IF NOT EXISTS "avatar_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "avatarConfigId" TEXT,
    "agentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "lipSyncData" TEXT NOT NULL DEFAULT '{}',
    "speechText" TEXT NOT NULL DEFAULT '',
    "audioUrl" TEXT,
    "videoUrl" TEXT,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "avatar_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "avatar_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "avatar_sessions_userId_idx" ON "avatar_sessions"("userId");
CREATE INDEX IF NOT EXISTS "avatar_sessions_status_idx" ON "avatar_sessions"("status");

CREATE TABLE IF NOT EXISTS "multimodal_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "inputModes" TEXT NOT NULL DEFAULT '[]',
    "outputModes" TEXT NOT NULL DEFAULT '[]',
    "streamUrl" TEXT,
    "recordings" TEXT NOT NULL DEFAULT '[]',
    "transcript" TEXT NOT NULL DEFAULT '',
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "frameCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "multimodal_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "multimodal_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "multimodal_sessions_userId_idx" ON "multimodal_sessions"("userId");
CREATE INDEX IF NOT EXISTS "multimodal_sessions_status_idx" ON "multimodal_sessions"("status");

-- ==========================================
-- MEMORY GRAPH
-- ==========================================

CREATE TABLE IF NOT EXISTS "memory_nodes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "properties" TEXT NOT NULL DEFAULT '{}',
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "memory_nodes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "memory_nodes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "memory_nodes_userId_label_type_idx" ON "memory_nodes"("userId", "label", "type");

CREATE TABLE IF NOT EXISTS "memory_edges" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceNodeId" TEXT NOT NULL,
    "targetNodeId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "properties" TEXT NOT NULL DEFAULT '{}',
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "memory_edges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "memory_edges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "memory_edges_sourceNodeId_fkey" FOREIGN KEY ("sourceNodeId") REFERENCES "memory_nodes"("id") ON DELETE CASCADE,
    CONSTRAINT "memory_edges_targetNodeId_fkey" FOREIGN KEY ("targetNodeId") REFERENCES "memory_nodes"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "memory_edges_userId_relation_idx" ON "memory_edges"("userId", "relation");
CREATE UNIQUE INDEX IF NOT EXISTS "memory_edges_sourceNodeId_targetNodeId_relation_key" ON "memory_edges"("sourceNodeId", "targetNodeId", "relation");

-- ==========================================
-- BILLING (complement)
-- ==========================================

CREATE TABLE IF NOT EXISTS "invoices" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeInvoiceId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "pdfUrl" TEXT,
    "hostedUrl" TEXT,
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoices_stripeInvoiceId_key" UNIQUE ("stripeInvoiceId"),
    CONSTRAINT "invoices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "invoices_userId_idx" ON "invoices"("userId");

-- ==========================================
-- WORKSPACES
-- ==========================================

CREATE TABLE IF NOT EXISTS "workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT DEFAULT '',
    "icon" TEXT,
    "settings" TEXT NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "workspaces_slug_key" ON "workspaces"("slug");
CREATE INDEX IF NOT EXISTS "workspaces_slug_idx" ON "workspaces"("slug");

CREATE TABLE IF NOT EXISTS "workspace_members" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "status" TEXT NOT NULL DEFAULT 'active',
    "invitedBy" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workspace_members_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE,
    CONSTRAINT "workspace_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_members_workspaceId_userId_key" ON "workspace_members"("workspaceId", "userId");
CREATE INDEX IF NOT EXISTS "workspace_members_userId_idx" ON "workspace_members"("userId");

CREATE TABLE IF NOT EXISTS "shared_agents" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "sharedBy" TEXT NOT NULL,
    "permissions" TEXT NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "shared_agents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shared_agents_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE,
    CONSTRAINT "shared_agents_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "shared_agents_workspaceId_agentId_key" ON "shared_agents"("workspaceId", "agentId");

CREATE TABLE IF NOT EXISTS "workspace_activities" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT NOT NULL DEFAULT '{}',
    "targetType" TEXT,
    "targetId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workspace_activities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workspace_activities_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE,
    CONSTRAINT "workspace_activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "workspace_activities_workspaceId_createdAt_idx" ON "workspace_activities"("workspaceId", "createdAt");

-- ==========================================
-- MARKETPLACE
-- ==========================================

CREATE TABLE IF NOT EXISTS "marketplace_listings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "config" TEXT NOT NULL DEFAULT '{}',
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "previewUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "installCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "marketplace_listings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "marketplace_listings_slug_key" UNIQUE ("slug"),
    CONSTRAINT "marketplace_listings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "marketplace_listings_userId_idx" ON "marketplace_listings"("userId");
CREATE INDEX IF NOT EXISTS "marketplace_listings_type_idx" ON "marketplace_listings"("type");

CREATE TABLE IF NOT EXISTS "marketplace_purchases" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "sellerRevenue" DOUBLE PRECISION,
    "platformCommission" DOUBLE PRECISION,
    "transferStatus" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "marketplace_purchases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "marketplace_purchases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "marketplace_purchases_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "marketplace_listings"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_purchases_userId_listingId_key" ON "marketplace_purchases"("userId", "listingId");

CREATE TABLE IF NOT EXISTS "marketplace_reviews" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "comment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'published',
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "marketplace_reviews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "marketplace_reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "marketplace_reviews_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "marketplace_listings"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_reviews_userId_listingId_key" ON "marketplace_reviews"("userId", "listingId");

-- ==========================================
-- PERSONALIZATION
-- ==========================================

CREATE TABLE IF NOT EXISTS "user_personalization" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "communicationStyle" TEXT NOT NULL DEFAULT 'balanced',
    "technicalLevel" TEXT NOT NULL DEFAULT 'intermediate',
    "preferredFormat" TEXT NOT NULL DEFAULT 'mixed',
    "responseLength" TEXT NOT NULL DEFAULT 'medium',
    "tonePreferences" TEXT NOT NULL DEFAULT '{}',
    "topicInterests" TEXT NOT NULL DEFAULT '[]',
    "languagePreference" TEXT NOT NULL DEFAULT 'en',
    "customInstructions" TEXT DEFAULT '',
    "interactionPatterns" TEXT NOT NULL DEFAULT '{}',
    "feedbackHistory" TEXT NOT NULL DEFAULT '[]',
    "adaptationScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "totalInteractions" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_personalization_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_personalization_userId_key" UNIQUE ("userId"),
    CONSTRAINT "user_personalization_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);

-- ==========================================
-- CONNECTORS & ACCESS KEYS
-- ==========================================

CREATE TABLE IF NOT EXISTS "mcp_connectors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "serverUrl" TEXT NOT NULL,
    "transportType" TEXT NOT NULL DEFAULT 'sse',
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "authType" TEXT NOT NULL DEFAULT 'none',
    "authConfig" TEXT NOT NULL DEFAULT '{}',
    "tools" TEXT NOT NULL DEFAULT '[]',
    "resources" TEXT NOT NULL DEFAULT '[]',
    "prompts" TEXT NOT NULL DEFAULT '[]',
    "capabilities" TEXT NOT NULL DEFAULT '{}',
    "serverInfo" TEXT NOT NULL DEFAULT '{}',
    "lastConnectedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "avgLatencyMs" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mcp_connectors_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mcp_connectors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "mcp_connectors_userId_status_idx" ON "mcp_connectors"("userId", "status");
CREATE INDEX IF NOT EXISTS "mcp_connectors_userId_createdAt_idx" ON "mcp_connectors"("userId", "createdAt");

CREATE TABLE IF NOT EXISTS "access_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "service" TEXT NOT NULL,
    "keyType" TEXT NOT NULL DEFAULT 'api_key',
    "keyValue" TEXT NOT NULL,
    "endpoint" TEXT,
    "scopes" TEXT NOT NULL DEFAULT '[]',
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "testEndpoint" TEXT,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestResult" TEXT,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "rateLimitInfo" TEXT NOT NULL DEFAULT '{}',
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "access_keys_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "access_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "access_keys_userId_service_idx" ON "access_keys"("userId", "service");
CREATE INDEX IF NOT EXISTS "access_keys_userId_isActive_idx" ON "access_keys"("userId", "isActive");

CREATE TABLE IF NOT EXISTS "connector_executions" (
    "id" TEXT NOT NULL,
    "connectorType" TEXT NOT NULL,
    "mcpConnectorId" TEXT,
    "accessKeyId" TEXT,
    "agentId" TEXT,
    "operation" TEXT NOT NULL,
    "inputParams" TEXT NOT NULL DEFAULT '{}',
    "outputResult" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "statusCode" INTEGER,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "tokenCost" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "connector_executions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "connector_executions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "connector_executions_userId_createdAt_idx" ON "connector_executions"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "connector_executions_status_createdAt_idx" ON "connector_executions"("status", "createdAt");

-- ==========================================
-- USER RESOURCES & APPROVALS
-- ==========================================

CREATE TABLE IF NOT EXISTS "user_resources" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "apiKey" TEXT,
    "endpoint" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_resources_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_resources_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "user_resources_userId_idx" ON "user_resources"("userId");

CREATE TABLE IF NOT EXISTS "approval_requests" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "approval_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "approval_requests_userId_idx" ON "approval_requests"("userId");
CREATE INDEX IF NOT EXISTS "approval_requests_agentId_idx" ON "approval_requests"("agentId");
CREATE INDEX IF NOT EXISTS "approval_requests_status_idx" ON "approval_requests"("status");

-- ==========================================
-- ADD MISSING FKs FOR EXISTING TABLES
-- ==========================================

-- password_resets FK
ALTER TABLE "password_resets" ADD CONSTRAINT IF NOT EXISTS "password_resets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
-- email_verifications FK
ALTER TABLE "email_verifications" ADD CONSTRAINT IF NOT EXISTS "email_verifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
-- social_accounts FK
ALTER TABLE "social_accounts" ADD CONSTRAINT IF NOT EXISTS "social_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
-- agent_permissions FK
ALTER TABLE "agent_permissions" ADD CONSTRAINT IF NOT EXISTS "agent_permissions_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE;
ALTER TABLE "agent_permissions" ADD CONSTRAINT IF NOT EXISTS "agent_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
-- agent_action_logs FK
ALTER TABLE "agent_action_logs" ADD CONSTRAINT IF NOT EXISTS "agent_action_logs_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE;
ALTER TABLE "agent_action_logs" ADD CONSTRAINT IF NOT EXISTS "agent_action_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
-- agent_usage FK
ALTER TABLE "agent_usage" ADD CONSTRAINT IF NOT EXISTS "agent_usage_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE;
ALTER TABLE "agent_usage" ADD CONSTRAINT IF NOT EXISTS "agent_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
-- agent_memories FK
ALTER TABLE "agent_memories" ADD CONSTRAINT IF NOT EXISTS "agent_memories_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE;
ALTER TABLE "agent_memories" ADD CONSTRAINT IF NOT EXISTS "agent_memories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
-- agent_automations FK
ALTER TABLE "agent_automations" ADD CONSTRAINT IF NOT EXISTS "agent_automations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
-- scheduled_tasks FK
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT IF NOT EXISTS "scheduled_tasks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
