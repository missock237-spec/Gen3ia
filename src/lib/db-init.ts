import { db } from "@/lib/db"

/**
 * Initialisation automatique du schéma SQLite/Postgres à l'exécution.
 * Nécessaire sur les plateformes serverless (Vercel) : le système de
 * fichiers applicatif est en lecture seule, la base vit dans un chemin
 * accessible en écriture (ex. /tmp) et le schéma doit être créé au
 * premier accès de chaque instance.
 *
 * Le DDL est GÉNÉRÉ depuis prisma/schema.prisma (source de vérité unique)
 * par `node scripts/gen-db-ddl.mjs` puis injecté entre les marqueurs
 * ci-dessous — ne pas éditer à la main : régénérer.
 *
 * Idempotent (IF NOT EXISTS, enchaîné une seule fois par processus).
 * Pour un déploiement Postgres persistant, utilisez `prisma migrate deploy`
 * — cette initialisation est alors sans effet (aucun DDL exécuté).
 */

// @generated-db-ddl:sqlite:start
const SQLITE_DDL = `
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "credits" REAL NOT NULL DEFAULT 25,
    "settings" TEXT,
    "chariowId" TEXT,
    "githubId" TEXT,
    "googleId" TEXT,
    "avatarUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "oauthProvider" TEXT
);

CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Agent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "systemPrompt" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'auto',
    "model" TEXT NOT NULL DEFAULT 'auto',
    "temperature" REAL NOT NULL DEFAULT 0.7,
    "maxTokens" INTEGER NOT NULL DEFAULT 4096,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
    "category" TEXT,
    "tags" TEXT,
    "config" TEXT,
    "stats" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Agent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "agentId" TEXT,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT NOT NULL DEFAULT 'chat,analyze,task',
    "requests" INTEGER NOT NULL DEFAULT 0,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "lastUsedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "agentId" TEXT,
    "prompt" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "analysis" TEXT,
    "plans" TEXT,
    "planScores" TEXT,
    "selectedPlanId" TEXT,
    "executionLog" TEXT,
    "verification" TEXT,
    "correctionLog" TEXT,
    "learning" TEXT,
    "result" TEXT,
    "pendingApproval" TEXT,
    "costCredits" REAL NOT NULL DEFAULT 0,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "totalRetries" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "TaskStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskStep_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "balanceAfter" REAL NOT NULL,
    "description" TEXT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'chariow',
    "checkoutId" TEXT,
    "plan" TEXT,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "credits" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "raw" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "agentId" TEXT,
    "title" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'TEXT',
    "content" TEXT NOT NULL,
    "chunks" TEXT,
    "size" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Memory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "agentId" TEXT,
    "layer" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "importance" REAL NOT NULL DEFAULT 0.5,
    "metadata" TEXT,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Memory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Skill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "definition" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "installs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Skill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Tool" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "parameters" TEXT,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "MarketplaceReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketplaceReview_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "detail" TEXT,
    "ip" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Embedding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "chunkText" TEXT NOT NULL,
    "embedding" TEXT NOT NULL,
    "dim" INTEGER NOT NULL,
    "norm" REAL NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Embedding_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "PlanCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "promptHash" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "embedding" TEXT,
    "plans" TEXT NOT NULL,
    "planScores" TEXT NOT NULL,
    "selectedPlanId" TEXT NOT NULL,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "EngineRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "engine" TEXT NOT NULL,
    "taskId" TEXT,
    "userId" TEXT,
    "phase" TEXT,
    "ok" BOOLEAN NOT NULL,
    "errorCode" TEXT,
    "durationMs" INTEGER NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "credits" REAL NOT NULL DEFAULT 0,
    "detail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "SystemConfig" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "TaskArtifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "phase" TEXT,
    "stepIndex" INTEGER,
    "payload" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskArtifact_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ConnectedAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "appSlug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INITIALIZING',
    "authScheme" TEXT NOT NULL,
    "encryptedData" TEXT NOT NULL,
    "meta" TEXT,
    "lastError" TEXT,
    "lastRefreshAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ConnectedAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ConnectionRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "appSlug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "redirectUri" TEXT,
    "state" TEXT NOT NULL,
    "verifierEnc" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "ConnectionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "SwarmSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT,
    "userId" TEXT NOT NULL,
    "strategy" TEXT NOT NULL DEFAULT 'HIERARCHICAL',
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "prompt" TEXT NOT NULL,
    "plan" TEXT,
    "result" TEXT,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "costCredits" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SwarmSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "SubTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assignedAgent" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dependencies" TEXT,
    "input" TEXT,
    "result" TEXT,
    "error" TEXT,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SubTask_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SwarmSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "SharedMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT,
    "userId" TEXT,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "namespace" TEXT NOT NULL DEFAULT 'default',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SharedMemory_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SwarmSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "SwarmMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "payload" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SwarmMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SwarmSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "TaskPriority" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "cost" REAL NOT NULL DEFAULT 0.33,
    "speed" REAL NOT NULL DEFAULT 0.33,
    "accuracy" REAL NOT NULL DEFAULT 0.34,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "ExplorationRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "variantCount" INTEGER NOT NULL,
    "winnerPlanId" TEXT NOT NULL,
    "results" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "FineTuneJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "datasetPath" TEXT,
    "datasetSize" INTEGER NOT NULL DEFAULT 0,
    "baseModel" TEXT NOT NULL,
    "engine" TEXT NOT NULL DEFAULT 'unsloth',
    "config" TEXT,
    "metrics" TEXT,
    "error" TEXT,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FineTuneJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AutoSkill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'typescript',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "successRate" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AutoSkill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "UserProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "responseStyle" TEXT NOT NULL DEFAULT 'balanced',
    "tone" TEXT NOT NULL DEFAULT 'professional',
    "language" TEXT NOT NULL DEFAULT 'fr',
    "detailLevel" REAL NOT NULL DEFAULT 0.5,
    "preferences" TEXT,
    "interactionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ImmutableAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "prevHash" TEXT,
    "entryHash" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "detail" TEXT,
    "ip" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "AnomalyAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'WARNING',
    "message" TEXT NOT NULL,
    "metric" TEXT,
    "threshold" REAL,
    "actualValue" REAL,
    "action" TEXT NOT NULL DEFAULT 'ALERT',
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Trace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "traceId" TEXT NOT NULL,
    "taskId" TEXT,
    "userId" TEXT,
    "rootSpanId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "spans" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "TraceSpan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "traceId" TEXT NOT NULL,
    "spanId" TEXT NOT NULL,
    "parentSpanId" TEXT,
    "name" TEXT NOT NULL,
    "startTime" REAL NOT NULL,
    "endTime" REAL,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "attributes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNSET',
    "events" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TraceSpan_traceId_fkey" FOREIGN KEY ("traceId") REFERENCES "Trace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "BatchTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "total" INTEGER NOT NULL DEFAULT 0,
    "completed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "results" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BatchTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "BatchItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "taskId" TEXT,
    "prompt" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "result" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BatchItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "BatchTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AgentListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "price" REAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "commission" REAL NOT NULL DEFAULT 0.1,
    "description" TEXT,
    "tags" TEXT,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "purchases" INTEGER NOT NULL DEFAULT 0,
    "revenue" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentListing_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Purchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "commission" REAL NOT NULL,
    "payout" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "WebhookConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "agentId" TEXT,
    "taskId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WebhookConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "WebhookDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "webhookId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "statusCode" INTEGER,
    "response" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "error" TEXT,
    "deliveredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "WebhookConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ExternalConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExternalConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "WatchConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "schedule" TEXT NOT NULL,
    "condition" TEXT,
    "alertChannel" TEXT NOT NULL DEFAULT 'email',
    "alertTarget" TEXT,
    "lastValue" TEXT,
    "lastCheckAt" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WatchConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "WatchExecution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "watchId" TEXT NOT NULL,
    "value" TEXT,
    "triggered" BOOLEAN NOT NULL DEFAULT false,
    "alertSent" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "executedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WatchExecution_watchId_fkey" FOREIGN KEY ("watchId") REFERENCES "WatchConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "OAuthIdentity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "avatarUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OAuthIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "OAuthAppConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appSlug" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "redirectUri" TEXT,
    "scopes" TEXT,
    "extraConfig" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "LiveSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "taskId" TEXT,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'LIVE',
    "viewerCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LiveSession_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "LiveParticipant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "displayName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" DATETIME,
    CONSTRAINT "LiveParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LiveParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "LiveSignal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" DATETIME,
    CONSTRAINT "LiveSignal_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LiveSignal_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "LiveParticipant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

CREATE UNIQUE INDEX IF NOT EXISTS "User_githubId_key" ON "User"("githubId");

CREATE UNIQUE INDEX IF NOT EXISTS "User_googleId_key" ON "User"("googleId");

CREATE UNIQUE INDEX IF NOT EXISTS "Session_token_key" ON "Session"("token");

CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "Agent_slug_key" ON "Agent"("slug");

CREATE INDEX IF NOT EXISTS "Agent_userId_idx" ON "Agent"("userId");

CREATE INDEX IF NOT EXISTS "Agent_status_visibility_idx" ON "Agent"("status", "visibility");

CREATE UNIQUE INDEX IF NOT EXISTS "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

CREATE INDEX IF NOT EXISTS "ApiKey_userId_idx" ON "ApiKey"("userId");

CREATE INDEX IF NOT EXISTS "Task_userId_createdAt_idx" ON "Task"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "Task_status_idx" ON "Task"("status");

CREATE INDEX IF NOT EXISTS "TaskStep_taskId_idx" ON "TaskStep"("taskId");

CREATE INDEX IF NOT EXISTS "Transaction_userId_createdAt_idx" ON "Transaction"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "Payment_userId_idx" ON "Payment"("userId");

CREATE INDEX IF NOT EXISTS "Document_userId_idx" ON "Document"("userId");

CREATE INDEX IF NOT EXISTS "Memory_userId_layer_idx" ON "Memory"("userId", "layer");

CREATE UNIQUE INDEX IF NOT EXISTS "Skill_key_key" ON "Skill"("key");

CREATE UNIQUE INDEX IF NOT EXISTS "Tool_key_key" ON "Tool"("key");

CREATE INDEX IF NOT EXISTS "MarketplaceReview_agentId_idx" ON "MarketplaceReview"("agentId");

CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

CREATE INDEX IF NOT EXISTS "Embedding_userId_documentId_idx" ON "Embedding"("userId", "documentId");

CREATE INDEX IF NOT EXISTS "Embedding_userId_model_idx" ON "Embedding"("userId", "model");

CREATE INDEX IF NOT EXISTS "PlanCache_userId_promptHash_idx" ON "PlanCache"("userId", "promptHash");

CREATE INDEX IF NOT EXISTS "PlanCache_userId_lastUsedAt_idx" ON "PlanCache"("userId", "lastUsedAt");

CREATE INDEX IF NOT EXISTS "EngineRun_engine_createdAt_idx" ON "EngineRun"("engine", "createdAt");

CREATE INDEX IF NOT EXISTS "EngineRun_taskId_idx" ON "EngineRun"("taskId");

CREATE INDEX IF NOT EXISTS "TaskArtifact_taskId_idx" ON "TaskArtifact"("taskId");

CREATE INDEX IF NOT EXISTS "ConnectedAccount_userId_idx" ON "ConnectedAccount"("userId");

CREATE INDEX IF NOT EXISTS "ConnectedAccount_appSlug_status_idx" ON "ConnectedAccount"("appSlug", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "ConnectedAccount_userId_appSlug_key" ON "ConnectedAccount"("userId", "appSlug");

CREATE UNIQUE INDEX IF NOT EXISTS "ConnectionRequest_state_key" ON "ConnectionRequest"("state");

CREATE INDEX IF NOT EXISTS "ConnectionRequest_userId_idx" ON "ConnectionRequest"("userId");

CREATE INDEX IF NOT EXISTS "ConnectionRequest_appSlug_status_idx" ON "ConnectionRequest"("appSlug", "status");

CREATE INDEX IF NOT EXISTS "SwarmSession_userId_createdAt_idx" ON "SwarmSession"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "SwarmSession_status_idx" ON "SwarmSession"("status");

CREATE INDEX IF NOT EXISTS "SubTask_sessionId_idx" ON "SubTask"("sessionId");

CREATE INDEX IF NOT EXISTS "SharedMemory_sessionId_namespace_key_idx" ON "SharedMemory"("sessionId", "namespace", "key");

CREATE INDEX IF NOT EXISTS "SwarmMessage_sessionId_channel_idx" ON "SwarmMessage"("sessionId", "channel");

CREATE UNIQUE INDEX IF NOT EXISTS "TaskPriority_taskId_key" ON "TaskPriority"("taskId");

CREATE INDEX IF NOT EXISTS "ExplorationRun_taskId_idx" ON "ExplorationRun"("taskId");

CREATE INDEX IF NOT EXISTS "FineTuneJob_userId_status_idx" ON "FineTuneJob"("userId", "status");

CREATE INDEX IF NOT EXISTS "AutoSkill_userId_idx" ON "AutoSkill"("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "UserProfile_userId_key" ON "UserProfile"("userId");

CREATE INDEX IF NOT EXISTS "ImmutableAuditLog_createdAt_idx" ON "ImmutableAuditLog"("createdAt");

CREATE INDEX IF NOT EXISTS "ImmutableAuditLog_userId_idx" ON "ImmutableAuditLog"("userId");

CREATE INDEX IF NOT EXISTS "AnomalyAlert_createdAt_idx" ON "AnomalyAlert"("createdAt");

CREATE INDEX IF NOT EXISTS "AnomalyAlert_resolved_idx" ON "AnomalyAlert"("resolved");

CREATE UNIQUE INDEX IF NOT EXISTS "Trace_traceId_key" ON "Trace"("traceId");

CREATE INDEX IF NOT EXISTS "Trace_taskId_idx" ON "Trace"("taskId");

CREATE INDEX IF NOT EXISTS "Trace_createdAt_idx" ON "Trace"("createdAt");

CREATE INDEX IF NOT EXISTS "TraceSpan_traceId_idx" ON "TraceSpan"("traceId");

CREATE INDEX IF NOT EXISTS "BatchTask_userId_createdAt_idx" ON "BatchTask"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "BatchItem_batchId_idx" ON "BatchItem"("batchId");

CREATE UNIQUE INDEX IF NOT EXISTS "AgentListing_agentId_key" ON "AgentListing"("agentId");

CREATE INDEX IF NOT EXISTS "Purchase_buyerId_idx" ON "Purchase"("buyerId");

CREATE INDEX IF NOT EXISTS "Purchase_sellerId_idx" ON "Purchase"("sellerId");

CREATE INDEX IF NOT EXISTS "WebhookConfig_userId_idx" ON "WebhookConfig"("userId");

CREATE INDEX IF NOT EXISTS "WebhookDelivery_webhookId_createdAt_idx" ON "WebhookDelivery"("webhookId", "createdAt");

CREATE INDEX IF NOT EXISTS "ExternalConnection_userId_type_idx" ON "ExternalConnection"("userId", "type");

CREATE INDEX IF NOT EXISTS "WatchConfig_userId_active_idx" ON "WatchConfig"("userId", "active");

CREATE INDEX IF NOT EXISTS "WatchExecution_watchId_executedAt_idx" ON "WatchExecution"("watchId", "executedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "OAuthIdentity_providerAccountId_key" ON "OAuthIdentity"("providerAccountId");

CREATE INDEX IF NOT EXISTS "OAuthIdentity_userId_idx" ON "OAuthIdentity"("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "OAuthIdentity_provider_providerAccountId_key" ON "OAuthIdentity"("provider", "providerAccountId");

CREATE UNIQUE INDEX IF NOT EXISTS "OAuthAppConfig_appSlug_key" ON "OAuthAppConfig"("appSlug");

CREATE INDEX IF NOT EXISTS "OAuthAppConfig_active_idx" ON "OAuthAppConfig"("active");

CREATE UNIQUE INDEX IF NOT EXISTS "LiveSession_code_key" ON "LiveSession"("code");

CREATE INDEX IF NOT EXISTS "LiveSession_status_createdAt_idx" ON "LiveSession"("status", "createdAt");

CREATE INDEX IF NOT EXISTS "LiveParticipant_sessionId_lastSeenAt_idx" ON "LiveParticipant"("sessionId", "lastSeenAt");

CREATE UNIQUE INDEX IF NOT EXISTS "LiveParticipant_sessionId_userId_key" ON "LiveParticipant"("sessionId", "userId");

CREATE INDEX IF NOT EXISTS "LiveSignal_sessionId_createdAt_idx" ON "LiveSignal"("sessionId", "createdAt");

CREATE INDEX IF NOT EXISTS "LiveSignal_toId_consumedAt_idx" ON "LiveSignal"("toId", "consumedAt");
`
// @generated-db-ddl:sqlite:end

// @generated-db-ddl:postgres:start
const POSTGRES_DDL = `
CREATE SCHEMA IF NOT EXISTS "public";

CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "credits" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "settings" TEXT,
    "chariowId" TEXT,
    "githubId" TEXT,
    "googleId" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "oauthProvider" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Agent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "systemPrompt" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'auto',
    "model" TEXT NOT NULL DEFAULT 'auto',
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "maxTokens" INTEGER NOT NULL DEFAULT 4096,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
    "category" TEXT,
    "tags" TEXT,
    "config" TEXT,
    "stats" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT NOT NULL DEFAULT 'chat,analyze,task',
    "requests" INTEGER NOT NULL DEFAULT 0,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Task" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT,
    "prompt" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "analysis" TEXT,
    "plans" TEXT,
    "planScores" TEXT,
    "selectedPlanId" TEXT,
    "executionLog" TEXT,
    "verification" TEXT,
    "correctionLog" TEXT,
    "learning" TEXT,
    "result" TEXT,
    "pendingApproval" TEXT,
    "costCredits" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "totalRetries" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TaskStep" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'chariow',
    "checkoutId" TEXT,
    "plan" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "credits" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "raw" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Document" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT,
    "title" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'TEXT',
    "content" TEXT NOT NULL,
    "chunks" TEXT,
    "size" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Memory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT,
    "layer" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "importance" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "metadata" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Memory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Skill" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "definition" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "installs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Tool" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "parameters" TEXT,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tool_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MarketplaceReview" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "detail" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Embedding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "chunkText" TEXT NOT NULL,
    "embedding" TEXT NOT NULL,
    "dim" INTEGER NOT NULL,
    "norm" DOUBLE PRECISION NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Embedding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PlanCache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "promptHash" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "embedding" TEXT,
    "plans" TEXT NOT NULL,
    "planScores" TEXT NOT NULL,
    "selectedPlanId" TEXT NOT NULL,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanCache_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EngineRun" (
    "id" TEXT NOT NULL,
    "engine" TEXT NOT NULL,
    "taskId" TEXT,
    "userId" TEXT,
    "phase" TEXT,
    "ok" BOOLEAN NOT NULL,
    "errorCode" TEXT,
    "durationMs" INTEGER NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "credits" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngineRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SystemConfig" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "TaskArtifact" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "phase" TEXT,
    "stepIndex" INTEGER,
    "payload" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskArtifact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ConnectedAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "appSlug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INITIALIZING',
    "authScheme" TEXT NOT NULL,
    "encryptedData" TEXT NOT NULL,
    "meta" TEXT,
    "lastError" TEXT,
    "lastRefreshAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectedAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ConnectionRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "appSlug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "redirectUri" TEXT,
    "state" TEXT NOT NULL,
    "verifierEnc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectionRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SwarmSession" (
    "id" TEXT NOT NULL,
    "taskId" TEXT,
    "userId" TEXT NOT NULL,
    "strategy" TEXT NOT NULL DEFAULT 'HIERARCHICAL',
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "prompt" TEXT NOT NULL,
    "plan" TEXT,
    "result" TEXT,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "costCredits" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SwarmSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SubTask" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assignedAgent" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dependencies" TEXT,
    "input" TEXT,
    "result" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SharedMemory" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "userId" TEXT,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "namespace" TEXT NOT NULL DEFAULT 'default',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SharedMemory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SwarmMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "payload" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SwarmMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TaskPriority" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0.33,
    "speed" DOUBLE PRECISION NOT NULL DEFAULT 0.33,
    "accuracy" DOUBLE PRECISION NOT NULL DEFAULT 0.34,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskPriority_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ExplorationRun" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "variantCount" INTEGER NOT NULL,
    "winnerPlanId" TEXT NOT NULL,
    "results" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExplorationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FineTuneJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "datasetPath" TEXT,
    "datasetSize" INTEGER NOT NULL DEFAULT 0,
    "baseModel" TEXT NOT NULL,
    "engine" TEXT NOT NULL DEFAULT 'unsloth',
    "config" TEXT,
    "metrics" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FineTuneJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AutoSkill" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'typescript',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "successRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoSkill_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "responseStyle" TEXT NOT NULL DEFAULT 'balanced',
    "tone" TEXT NOT NULL DEFAULT 'professional',
    "language" TEXT NOT NULL DEFAULT 'fr',
    "detailLevel" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "preferences" TEXT,
    "interactionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ImmutableAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "prevHash" TEXT,
    "entryHash" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "detail" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImmutableAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AnomalyAlert" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'WARNING',
    "message" TEXT NOT NULL,
    "metric" TEXT,
    "threshold" DOUBLE PRECISION,
    "actualValue" DOUBLE PRECISION,
    "action" TEXT NOT NULL DEFAULT 'ALERT',
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnomalyAlert_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Trace" (
    "id" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "taskId" TEXT,
    "userId" TEXT,
    "rootSpanId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "spans" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TraceSpan" (
    "id" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "spanId" TEXT NOT NULL,
    "parentSpanId" TEXT,
    "name" TEXT NOT NULL,
    "startTime" DOUBLE PRECISION NOT NULL,
    "endTime" DOUBLE PRECISION,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "attributes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNSET',
    "events" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TraceSpan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BatchTask" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "total" INTEGER NOT NULL DEFAULT 0,
    "completed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "results" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatchTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BatchItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "taskId" TEXT,
    "prompt" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "result" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatchItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AgentListing" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "commission" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "description" TEXT,
    "tags" TEXT,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "purchases" INTEGER NOT NULL DEFAULT 0,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentListing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Purchase" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "commission" DOUBLE PRECISION NOT NULL,
    "payout" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WebhookConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "agentId" TEXT,
    "taskId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "statusCode" INTEGER,
    "response" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "error" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ExternalConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WatchConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "schedule" TEXT NOT NULL,
    "condition" TEXT,
    "alertChannel" TEXT NOT NULL DEFAULT 'email',
    "alertTarget" TEXT,
    "lastValue" TEXT,
    "lastCheckAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatchConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WatchExecution" (
    "id" TEXT NOT NULL,
    "watchId" TEXT NOT NULL,
    "value" TEXT,
    "triggered" BOOLEAN NOT NULL DEFAULT false,
    "alertSent" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchExecution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OAuthIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OAuthAppConfig" (
    "id" TEXT NOT NULL,
    "appSlug" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "redirectUri" TEXT,
    "scopes" TEXT,
    "extraConfig" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthAppConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LiveSession" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "taskId" TEXT,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'LIVE',
    "viewerCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LiveParticipant" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "displayName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "LiveParticipant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LiveSignal" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "LiveSignal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

CREATE UNIQUE INDEX IF NOT EXISTS "User_githubId_key" ON "User"("githubId");

CREATE UNIQUE INDEX IF NOT EXISTS "User_googleId_key" ON "User"("googleId");

CREATE UNIQUE INDEX IF NOT EXISTS "Session_token_key" ON "Session"("token");

CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "Agent_slug_key" ON "Agent"("slug");

CREATE INDEX IF NOT EXISTS "Agent_userId_idx" ON "Agent"("userId");

CREATE INDEX IF NOT EXISTS "Agent_status_visibility_idx" ON "Agent"("status", "visibility");

CREATE UNIQUE INDEX IF NOT EXISTS "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

CREATE INDEX IF NOT EXISTS "ApiKey_userId_idx" ON "ApiKey"("userId");

CREATE INDEX IF NOT EXISTS "Task_userId_createdAt_idx" ON "Task"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "Task_status_idx" ON "Task"("status");

CREATE INDEX IF NOT EXISTS "TaskStep_taskId_idx" ON "TaskStep"("taskId");

CREATE INDEX IF NOT EXISTS "Transaction_userId_createdAt_idx" ON "Transaction"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "Payment_userId_idx" ON "Payment"("userId");

CREATE INDEX IF NOT EXISTS "Document_userId_idx" ON "Document"("userId");

CREATE INDEX IF NOT EXISTS "Memory_userId_layer_idx" ON "Memory"("userId", "layer");

CREATE UNIQUE INDEX IF NOT EXISTS "Skill_key_key" ON "Skill"("key");

CREATE UNIQUE INDEX IF NOT EXISTS "Tool_key_key" ON "Tool"("key");

CREATE INDEX IF NOT EXISTS "MarketplaceReview_agentId_idx" ON "MarketplaceReview"("agentId");

CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

CREATE INDEX IF NOT EXISTS "Embedding_userId_documentId_idx" ON "Embedding"("userId", "documentId");

CREATE INDEX IF NOT EXISTS "Embedding_userId_model_idx" ON "Embedding"("userId", "model");

CREATE INDEX IF NOT EXISTS "PlanCache_userId_promptHash_idx" ON "PlanCache"("userId", "promptHash");

CREATE INDEX IF NOT EXISTS "PlanCache_userId_lastUsedAt_idx" ON "PlanCache"("userId", "lastUsedAt");

CREATE INDEX IF NOT EXISTS "EngineRun_engine_createdAt_idx" ON "EngineRun"("engine", "createdAt");

CREATE INDEX IF NOT EXISTS "EngineRun_taskId_idx" ON "EngineRun"("taskId");

CREATE INDEX IF NOT EXISTS "TaskArtifact_taskId_idx" ON "TaskArtifact"("taskId");

CREATE INDEX IF NOT EXISTS "ConnectedAccount_userId_idx" ON "ConnectedAccount"("userId");

CREATE INDEX IF NOT EXISTS "ConnectedAccount_appSlug_status_idx" ON "ConnectedAccount"("appSlug", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "ConnectedAccount_userId_appSlug_key" ON "ConnectedAccount"("userId", "appSlug");

CREATE UNIQUE INDEX IF NOT EXISTS "ConnectionRequest_state_key" ON "ConnectionRequest"("state");

CREATE INDEX IF NOT EXISTS "ConnectionRequest_userId_idx" ON "ConnectionRequest"("userId");

CREATE INDEX IF NOT EXISTS "ConnectionRequest_appSlug_status_idx" ON "ConnectionRequest"("appSlug", "status");

CREATE INDEX IF NOT EXISTS "SwarmSession_userId_createdAt_idx" ON "SwarmSession"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "SwarmSession_status_idx" ON "SwarmSession"("status");

CREATE INDEX IF NOT EXISTS "SubTask_sessionId_idx" ON "SubTask"("sessionId");

CREATE INDEX IF NOT EXISTS "SharedMemory_sessionId_namespace_key_idx" ON "SharedMemory"("sessionId", "namespace", "key");

CREATE INDEX IF NOT EXISTS "SwarmMessage_sessionId_channel_idx" ON "SwarmMessage"("sessionId", "channel");

CREATE UNIQUE INDEX IF NOT EXISTS "TaskPriority_taskId_key" ON "TaskPriority"("taskId");

CREATE INDEX IF NOT EXISTS "ExplorationRun_taskId_idx" ON "ExplorationRun"("taskId");

CREATE INDEX IF NOT EXISTS "FineTuneJob_userId_status_idx" ON "FineTuneJob"("userId", "status");

CREATE INDEX IF NOT EXISTS "AutoSkill_userId_idx" ON "AutoSkill"("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "UserProfile_userId_key" ON "UserProfile"("userId");

CREATE INDEX IF NOT EXISTS "ImmutableAuditLog_createdAt_idx" ON "ImmutableAuditLog"("createdAt");

CREATE INDEX IF NOT EXISTS "ImmutableAuditLog_userId_idx" ON "ImmutableAuditLog"("userId");

CREATE INDEX IF NOT EXISTS "AnomalyAlert_createdAt_idx" ON "AnomalyAlert"("createdAt");

CREATE INDEX IF NOT EXISTS "AnomalyAlert_resolved_idx" ON "AnomalyAlert"("resolved");

CREATE UNIQUE INDEX IF NOT EXISTS "Trace_traceId_key" ON "Trace"("traceId");

CREATE INDEX IF NOT EXISTS "Trace_taskId_idx" ON "Trace"("taskId");

CREATE INDEX IF NOT EXISTS "Trace_createdAt_idx" ON "Trace"("createdAt");

CREATE INDEX IF NOT EXISTS "TraceSpan_traceId_idx" ON "TraceSpan"("traceId");

CREATE INDEX IF NOT EXISTS "BatchTask_userId_createdAt_idx" ON "BatchTask"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "BatchItem_batchId_idx" ON "BatchItem"("batchId");

CREATE UNIQUE INDEX IF NOT EXISTS "AgentListing_agentId_key" ON "AgentListing"("agentId");

CREATE INDEX IF NOT EXISTS "Purchase_buyerId_idx" ON "Purchase"("buyerId");

CREATE INDEX IF NOT EXISTS "Purchase_sellerId_idx" ON "Purchase"("sellerId");

CREATE INDEX IF NOT EXISTS "WebhookConfig_userId_idx" ON "WebhookConfig"("userId");

CREATE INDEX IF NOT EXISTS "WebhookDelivery_webhookId_createdAt_idx" ON "WebhookDelivery"("webhookId", "createdAt");

CREATE INDEX IF NOT EXISTS "ExternalConnection_userId_type_idx" ON "ExternalConnection"("userId", "type");

CREATE INDEX IF NOT EXISTS "WatchConfig_userId_active_idx" ON "WatchConfig"("userId", "active");

CREATE INDEX IF NOT EXISTS "WatchExecution_watchId_executedAt_idx" ON "WatchExecution"("watchId", "executedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "OAuthIdentity_providerAccountId_key" ON "OAuthIdentity"("providerAccountId");

CREATE INDEX IF NOT EXISTS "OAuthIdentity_userId_idx" ON "OAuthIdentity"("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "OAuthIdentity_provider_providerAccountId_key" ON "OAuthIdentity"("provider", "providerAccountId");

CREATE UNIQUE INDEX IF NOT EXISTS "OAuthAppConfig_appSlug_key" ON "OAuthAppConfig"("appSlug");

CREATE INDEX IF NOT EXISTS "OAuthAppConfig_active_idx" ON "OAuthAppConfig"("active");

CREATE UNIQUE INDEX IF NOT EXISTS "LiveSession_code_key" ON "LiveSession"("code");

CREATE INDEX IF NOT EXISTS "LiveSession_status_createdAt_idx" ON "LiveSession"("status", "createdAt");

CREATE INDEX IF NOT EXISTS "LiveParticipant_sessionId_lastSeenAt_idx" ON "LiveParticipant"("sessionId", "lastSeenAt");

CREATE UNIQUE INDEX IF NOT EXISTS "LiveParticipant_sessionId_userId_key" ON "LiveParticipant"("sessionId", "userId");

CREATE INDEX IF NOT EXISTS "LiveSignal_sessionId_createdAt_idx" ON "LiveSignal"("sessionId", "createdAt");

CREATE INDEX IF NOT EXISTS "LiveSignal_toId_consumedAt_idx" ON "LiveSignal"("toId", "consumedAt");

ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Agent" ADD CONSTRAINT "Agent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Task" ADD CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Task" ADD CONSTRAINT "Task_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TaskStep" ADD CONSTRAINT "TaskStep_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Document" ADD CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Memory" ADD CONSTRAINT "Memory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Skill" ADD CONSTRAINT "Skill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketplaceReview" ADD CONSTRAINT "MarketplaceReview_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Embedding" ADD CONSTRAINT "Embedding_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskArtifact" ADD CONSTRAINT "TaskArtifact_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConnectedAccount" ADD CONSTRAINT "ConnectedAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConnectionRequest" ADD CONSTRAINT "ConnectionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SwarmSession" ADD CONSTRAINT "SwarmSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SubTask" ADD CONSTRAINT "SubTask_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SwarmSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SharedMemory" ADD CONSTRAINT "SharedMemory_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SwarmSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SwarmMessage" ADD CONSTRAINT "SwarmMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SwarmSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FineTuneJob" ADD CONSTRAINT "FineTuneJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutoSkill" ADD CONSTRAINT "AutoSkill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TraceSpan" ADD CONSTRAINT "TraceSpan_traceId_fkey" FOREIGN KEY ("traceId") REFERENCES "Trace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BatchTask" ADD CONSTRAINT "BatchTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BatchItem" ADD CONSTRAINT "BatchItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "BatchTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentListing" ADD CONSTRAINT "AgentListing_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WebhookConfig" ADD CONSTRAINT "WebhookConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "WebhookConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExternalConnection" ADD CONSTRAINT "ExternalConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WatchConfig" ADD CONSTRAINT "WatchConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WatchExecution" ADD CONSTRAINT "WatchExecution_watchId_fkey" FOREIGN KEY ("watchId") REFERENCES "WatchConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OAuthIdentity" ADD CONSTRAINT "OAuthIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LiveParticipant" ADD CONSTRAINT "LiveParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LiveParticipant" ADD CONSTRAINT "LiveParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LiveSignal" ADD CONSTRAINT "LiveSignal_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LiveSignal" ADD CONSTRAINT "LiveSignal_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "LiveParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
`
// @generated-db-ddl:postgres:end

/** Compléments non idempotents : colonnes ajoutées après coup (silencieux si déjà présentes). */
const MIGRATION_DDL = `
ALTER TABLE "Task" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Task" ADD COLUMN "totalRetries" INTEGER NOT NULL DEFAULT 0;
`

const globalForInit = globalThis as unknown as { gen3iaSchemaReady?: Promise<void> }

/** Garantit que le schéma existe (une fois par processus). */
export function ensureSchema(): Promise<void> {
  if (!globalForInit.gen3iaSchemaReady) {
    globalForInit.gen3iaSchemaReady = (async () => {
      const url = process.env.DATABASE_URL ?? ""
      const isPostgres = url.startsWith("postgres://") || url.startsWith("postgresql://")
      const dialectError =
        /already exists|UNIQUE|duplicate key|multiple primary key|duplicate column/i
      try {
        const ddl = (isPostgres ? POSTGRES_DDL : SQLITE_DDL) + MIGRATION_DDL
        for (const statement of ddl.split(";")) {
          const trimmed = statement.trim()
          // Ignore les commentaires et les blocs vides.
          const cleaned = trimmed.replace(/^(--[\s\S]*?)?(?=[A-Z(])/, "").trim()
          if (!cleaned || !/^(CREATE|ALTER)/i.test(cleaned)) continue
          try {
            await db.$executeRawUnsafe(cleaned + ";")
          } catch (err) {
            // Initialisation concurrente ou colonne déjà présente : on ignore proprement.
            if (err instanceof Error && dialectError.test(err.message)) continue
            throw err
          }
        }
      } catch (err) {
        console.error("[db-init] échec d'initialisation :", err)
      }
    })()
  }
  return globalForInit.gen3iaSchemaReady
}
