/**
 * Database — Prisma Client Singleton
 *
 * Ensures the correct DATABASE_URL is used even when a system-level
 * environment variable overrides the .env file (e.g. in shared hosting
 * or container environments where DATABASE_URL may point to SQLite).
 *
 * Resolution order:
 *   1. GENOVA_DATABASE_URL — explicit override for production deployments
 *   2. .env file — parsed directly via dotenv (bypasses system env)
 *   3. process.env.DATABASE_URL — system-level fallback
 */

import { PrismaClient } from '@prisma/client'
import { env } from '@/lib/env'

function resolveDatabaseUrl(): string {
  const databaseUrl = process.env.GENOVA_DATABASE_URL || env.DATABASE_URL

  if (
    !databaseUrl.startsWith('postgresql://') &&
    !databaseUrl.startsWith('postgres://')
  ) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection string')
  }

  return databaseUrl
}

const databaseUrl = resolveDatabaseUrl()

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: databaseUrl,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}
