-- ============================================================
-- GENOVA — Migration initiale versionnée
-- Date: 2026-07-20
-- ============================================================

-- CreateTable users
CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "avatar" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "role" TEXT NOT NULL DEFAULT 'user',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "stripeConnectAccountId" TEXT,
    "stripeConnectOnboarded" BOOLEAN NOT NULL DEFAULT false,
    "emailVerified" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "users_email_key" UNIQUE ("email"),
    CONSTRAINT "users_stripeConnectAccountId_key" UNIQUE ("stripeConnectAccountId")
);

CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users"("email");
CREATE INDEX IF NOT EXISTS "users_role_idx" ON "users"("role");

-- CreateTable sessions
CREATE TABLE IF NOT EXISTS "sessions" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "refreshExpiresAt" TIMESTAMP(3),
    "rememberMe" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sessions_token_key" UNIQUE ("token"),
    CONSTRAINT "sessions_refreshToken_key" UNIQUE ("refreshToken"),
    CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);

-- CreateTable agents
CREATE TABLE IF NOT EXISTS "agents" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "config" TEXT NOT NULL,
    "avatar" TEXT,
    "userId" TEXT NOT NULL,
    "maxIterations" INTEGER NOT NULL DEFAULT 25,
    "maxCostLimit" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "agents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "agents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);

-- CreateTable agent_checkpoints
CREATE TABLE IF NOT EXISTS "agent_checkpoints" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 0,
    "context" JSONB NOT NULL,
    "memory" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "agent_checkpoints_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "agent_checkpoints_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE,
    CONSTRAINT "agent_checkpoints_agentId_sessionId_step_key" UNIQUE ("agentId", "sessionId", "step")
);

CREATE INDEX IF NOT EXISTS "agent_checkpoints_agentId_sessionId_idx" ON "agent_checkpoints"("agentId", "sessionId");
CREATE INDEX IF NOT EXISTS "agent_checkpoints_agentId_step_idx" ON "agent_checkpoints"("agentId", "step");
CREATE INDEX IF NOT EXISTS "agent_checkpoints_sessionId_idx" ON "agent_checkpoints"("sessionId");

-- CreateTable supervisor_logs
CREATE TABLE IF NOT EXISTS "supervisor_logs" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "iteration" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'running',
    "currentCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentTokens" INTEGER NOT NULL DEFAULT 0,
    "decision" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supervisor_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "supervisor_logs_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "supervisor_logs_agentId_sessionId_idx" ON "supervisor_logs"("agentId", "sessionId");
CREATE INDEX IF NOT EXISTS "supervisor_logs_agentId_sessionId_iteration_idx" ON "supervisor_logs"("agentId", "sessionId", "iteration");
CREATE INDEX IF NOT EXISTS "supervisor_logs_sessionId_idx" ON "supervisor_logs"("sessionId");
CREATE INDEX IF NOT EXISTS "supervisor_logs_status_idx" ON "supervisor_logs"("status");
CREATE INDEX IF NOT EXISTS "supervisor_logs_createdAt_idx" ON "supervisor_logs"("createdAt");

-- CreateTable subscriptions
CREATE TABLE IF NOT EXISTS "subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "status" TEXT NOT NULL DEFAULT 'active',
    "stripeId" TEXT,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "trialStart" TIMESTAMP(3),
    "trialEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subscriptions_userId_key" UNIQUE ("userId"),
    CONSTRAINT "subscriptions_stripeId_key" UNIQUE ("stripeId"),
    CONSTRAINT "subscriptions_stripeCustomerId_key" UNIQUE ("stripeCustomerId"),
    CONSTRAINT "subscriptions_stripeSubscriptionId_key" UNIQUE ("stripeSubscriptionId"),
    CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "subscriptions_userId_idx" ON "subscriptions"("userId");

-- CreateTable agent_executions
CREATE TABLE IF NOT EXISTS "agent_executions" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "task" TEXT NOT NULL DEFAULT '',
    "steps" TEXT NOT NULL DEFAULT '[]',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "totalSteps" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "totalDuration" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "model" TEXT,
    "provider" TEXT,
    "result" TEXT,
    "error" TEXT,
    "state" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "agent_executions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "agent_executions_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE,
    CONSTRAINT "agent_executions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "agent_executions_agentId_createdAt_idx" ON "agent_executions"("agentId", "createdAt");
CREATE INDEX IF NOT EXISTS "agent_executions_userId_createdAt_idx" ON "agent_executions"("userId", "createdAt");

-- CreateTable credit_transactions
CREATE TABLE IF NOT EXISTS "credit_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL,
    "type" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "description" TEXT NOT NULL,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "credit_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "credit_transactions_userId_idx" ON "credit_transactions"("userId");