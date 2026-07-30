import { PrismaClient } from '@prisma/client';

function resolveDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL || process.env.GEN3IA_DATABASE_URL || process.env.GENOVA_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set. Define DATABASE_URL or GEN3IA_DATABASE_URL in your environment.');
  }
  if (!databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection string');
  }
  return databaseUrl;
}

const databaseUrl = resolveDatabaseUrl();

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: databaseUrl,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}

export default db;
