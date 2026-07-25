-- Migration: Add direction field to VoiceCall for inbound/outbound tracking

ALTER TABLE "voice_calls" ADD COLUMN IF NOT EXISTS "direction" TEXT NOT NULL DEFAULT 'outbound';

CREATE INDEX IF NOT EXISTS idx_voice_calls_direction ON "voice_calls"("direction");
CREATE INDEX IF NOT EXISTS idx_voice_calls_call_sid ON "voice_calls"("call_sid");
CREATE INDEX IF NOT EXISTS idx_voice_calls_status_call_sid ON "voice_calls"("status", "call_sid");
