import { PrismaClient } from '@prisma/client'

function resolveDatabaseUrl(): string {
  const databaseUrl = process.env.GENOVA_DATABASE_URL || process.env.DATABASE_URL || ''

  if (!databaseUrl) {
    throw new Error('DATABASE_URL or GENOVA_DATABASE_URL is required')
  }

  if (
    !databaseUrl.startsWith('postgresql://') &&
    !databaseUrl.startsWith('postgres://')
  ) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection string')
  }

  return databaseUrl
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      datasourceUrl: resolveDatabaseUrl(),
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    })
  }
  return globalForPrisma.prisma
}

// Lazy Proxy — resolveDatabaseUrl() is called only on the first actual DB
// operation, not at module import time. Routes that don't use the DB won't
// crash if DATABASE_URL is missing.
export const db = new Proxy({} as PrismaClient, {
  get(_target: PrismaClient, prop: string | symbol): unknown {
    return (getPrismaClient() as unknown as Record<string | symbol, unknown>)[prop]
  },
})
