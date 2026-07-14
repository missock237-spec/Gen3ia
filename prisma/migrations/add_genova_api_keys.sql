-- Migration: Add GenovaApiKey model
-- Run: npx prisma db push

CREATE TABLE IF NOT EXISTS "genova_api_keys" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyLastFour" TEXT NOT NULL,
    "scopes" TEXT NOT NULL DEFAULT '[]',
    "rateLimitPerMinute" INTEGER NOT NULL DEFAULT 60,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "genova_api_keys_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "genova_api_keys_keyHash_key" UNIQUE ("keyHash")
);

CREATE INDEX IF NOT EXISTS "genova_api_keys_userId_isActive_idx" ON "genova_api_keys"("userId", "isActive");
CREATE INDEX IF NOT EXISTS "genova_api_keys_keyHash_idx" ON "genova_api_keys"("keyHash");

ALTER TABLE "genova_api_keys" ADD CONSTRAINT "genova_api_keys_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
