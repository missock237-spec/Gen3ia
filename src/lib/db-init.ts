import { db } from "@/lib/db"

/**
 * Initialisation automatique du schéma SQLite/Postgres à l'exécution.
 * Nécessaire sur les plateformes serverless (Vercel) : le système de
 * fichiers applicatif est en lecture seule, la base vit dans un chemin
 * accessible en écriture (ex. /tmp) et le schéma doit être créé au
 * premier accès de chaque instance.
 *
 * Idempotent (IF NOT EXISTS, enchaîné une seule fois par processus).
 * Pour un déploiement Postgres persistant, utilisez `prisma migrate deploy`
 * — cette initialisation est alors sans effet (aucun DDL exécuté).
 */

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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "Session_token_key" ON "Session"("token");
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
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "Agent_slug_key" ON "Agent"("slug");
CREATE INDEX IF NOT EXISTS "Agent_userId_idx" ON "Agent"("userId");
CREATE INDEX IF NOT EXISTS "Agent_status_visibility_idx" ON "Agent"("status", "visibility");
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ApiKey_keyHash_key" ON "ApiKey"("keyHash");
CREATE INDEX IF NOT EXISTS "ApiKey_userId_idx" ON "ApiKey"("userId");
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
    "updatedAt" DATETIME NOT NULL
);
CREATE INDEX IF NOT EXISTS "Task_userId_createdAt_idx" ON "Task"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "Task_status_idx" ON "Task"("status");
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "TaskStep_taskId_idx" ON "TaskStep"("taskId");
CREATE TABLE IF NOT EXISTS "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "balanceAfter" REAL NOT NULL,
    "description" TEXT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Transaction_userId_createdAt_idx" ON "Transaction"("userId", "createdAt");
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
    "updatedAt" DATETIME NOT NULL
);
CREATE INDEX IF NOT EXISTS "Payment_userId_idx" ON "Payment"("userId");
CREATE TABLE IF NOT EXISTS "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "agentId" TEXT,
    "title" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'TEXT',
    "content" TEXT NOT NULL,
    "chunks" TEXT,
    "size" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Document_userId_idx" ON "Document"("userId");
CREATE TABLE IF NOT EXISTS "Memory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "agentId" TEXT,
    "layer" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "importance" REAL NOT NULL DEFAULT 0.5,
    "metadata" TEXT,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Memory_userId_layer_idx" ON "Memory"("userId", "layer");
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "Skill_key_key" ON "Skill"("key");
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
CREATE UNIQUE INDEX IF NOT EXISTS "Tool_key_key" ON "Tool"("key");
CREATE TABLE IF NOT EXISTS "MarketplaceReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "MarketplaceReview_agentId_idx" ON "MarketplaceReview"("agentId");
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "detail" TEXT,
    "ip" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE TABLE IF NOT EXISTS "Embedding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL DEFAULT 0,
    "chunkText" TEXT NOT NULL,
    "embedding" TEXT NOT NULL,
    "dim" INTEGER NOT NULL,
    "norm" REAL NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Embedding_userId_documentId_idx" ON "Embedding"("userId", "documentId");
CREATE INDEX IF NOT EXISTS "Embedding_userId_model_idx" ON "Embedding"("userId", "model");
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
CREATE INDEX IF NOT EXISTS "PlanCache_userId_promptHash_idx" ON "PlanCache"("userId", "promptHash");
CREATE INDEX IF NOT EXISTS "PlanCache_userId_lastUsedAt_idx" ON "PlanCache"("userId", "lastUsedAt");
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
CREATE INDEX IF NOT EXISTS "EngineRun_engine_createdAt_idx" ON "EngineRun"("engine", "createdAt");
CREATE INDEX IF NOT EXISTS "EngineRun_taskId_idx" ON "EngineRun"("taskId");
CREATE TABLE IF NOT EXISTS "SystemConfig" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "TaskArtifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "phase" TEXT,
    "stepIndex" INTEGER,
    "payload" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "TaskArtifact_taskId_idx" ON "TaskArtifact"("taskId");
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
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ConnectedAccount_userId_appSlug_key" ON "ConnectedAccount"("userId", "appSlug");
CREATE INDEX IF NOT EXISTS "ConnectedAccount_userId_idx" ON "ConnectedAccount"("userId");
CREATE INDEX IF NOT EXISTS "ConnectedAccount_appSlug_status_idx" ON "ConnectedAccount"("appSlug", "status");
CREATE TABLE IF NOT EXISTS "ConnectionRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "appSlug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "redirectUri" TEXT,
    "state" TEXT NOT NULL,
    "verifierEnc" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ConnectionRequest_state_key" ON "ConnectionRequest"("state");
CREATE INDEX IF NOT EXISTS "ConnectionRequest_userId_idx" ON "ConnectionRequest"("userId");
CREATE INDEX IF NOT EXISTS "ConnectionRequest_appSlug_status_idx" ON "ConnectionRequest"("appSlug", "status");
`

/** Dialecte Postgres : mêmes tables, typage natif (TIMESTAMP, DOUBLE PRECISION, BOOLEAN). */
const POSTGRES_DDL = SQLITE_DDL.replaceAll(" DATETIME ", " TIMESTAMP ")
  .replaceAll("DATETIME NOT NULL", "TIMESTAMP NOT NULL")
  .replaceAll(" REAL ", " DOUBLE PRECISION ")
  .replaceAll("REAL NOT NULL", "DOUBLE PRECISION NOT NULL")

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
