-- Migration: Add missing fields to ApprovalRequest for human-in-the-loop
-- sessionId, severity, expiresAt, resolvedBy, comment étaient manquants

ALTER TABLE "approval_requests" ADD COLUMN IF NOT EXISTS "session_id" TEXT NOT NULL DEFAULT '';
ALTER TABLE "approval_requests" ADD COLUMN IF NOT EXISTS "severity" TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE "approval_requests" ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '15 minutes';
ALTER TABLE "approval_requests" ADD COLUMN IF NOT EXISTS "resolved_by" TEXT NOT NULL DEFAULT '';
ALTER TABLE "approval_requests" ADD COLUMN IF NOT EXISTS "comment" TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_approval_requests_severity ON "approval_requests"("severity");
CREATE INDEX IF NOT EXISTS idx_approval_requests_expires_at ON "approval_requests"("expires_at");
