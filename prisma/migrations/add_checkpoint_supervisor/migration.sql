-- Add fields to Agent model
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "maxIterations" INTEGER NOT NULL DEFAULT 25;
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "maxCostLimit" DOUBLE PRECISION NOT NULL DEFAULT 1.0;

-- Create AgentCheckpoint table
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

-- Create SupervisorLog table
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