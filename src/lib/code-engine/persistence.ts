/**
 * Persistence Engine — Stockage persistant des sessions, executions et deploiements
 * 
 * Remplacent les Maps memoires par du stockage persistant.
 * Utilise Prisma + PostgreSQL en production, fichier JSON en dev.
 */

import { PrismaClient } from '@prisma/client';

// Singleton Prisma
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// ====== TYPES PERSISTANTS ======

export interface PersistedSession {
  id: string;
  userId: string;
  code: string;
  language: string;
  name?: string;
  createdAt: Date;
  updatedAt: Date;
  lastExecutedAt?: Date;
  executionCount: number;
  isPublic: boolean;
  shareToken?: string;
}

export interface PersistedExecution {
  id: string;
  sessionId?: string;
  userId: string;
  code: string;
  language: string;
  output: string;
  success: boolean;
  error?: string;
  duration: number;
  tokens: number;
  createdAt: Date;
}

export interface PersistedDeployment {
  id: string;
  userId: string;
  name: string;
  type: 'api' | 'function' | 'webhook' | 'cron';
  code: string;
  url: string;
  method: string;
  allowedOrigins: string[];
  callCount: number;
  lastCalled?: Date;
  createdAt: Date;
  expiresAt: Date;
  active: boolean;
}

// ====== SESSION PERSISTANCE ======

export async function saveSession(session: Omit<PersistedSession, 'createdAt' | 'updatedAt' | 'executionCount'>): Promise<PersistedSession> {
  try {
    const created = await prisma.codeSession.create({
      data: {
        id: session.id,
        userId: session.userId,
        code: session.code,
        language: session.language,
        name: session.name || null,
        isPublic: session.isPublic || false,
        shareToken: session.shareToken || null,
        executionCount: 0,
      },
    });
    return created as unknown as PersistedSession;
  } catch (error) {
    console.error('[Persistence] Erreur saveSession:', error);
    throw error;
  }
}

export async function updateSessionCode(sessionId: string, code: string, language?: string): Promise<PersistedSession | null> {
  try {
    const updated = await prisma.codeSession.update({
      where: { id: sessionId },
      data: {
        code,
        ...(language ? { language } : {}),
        updatedAt: new Date(),
      },
    });
    return updated as unknown as PersistedSession;
  } catch {
    return null;
  }
}

export async function getSession(sessionId: string): Promise<PersistedSession | null> {
  try {
    const session = await prisma.codeSession.findUnique({ where: { id: sessionId } });
    return session as unknown as PersistedSession | null;
  } catch {
    return null;
  }
}

export async function getUserSessions(userId: string, limit = 50): Promise<PersistedSession[]> {
  try {
    const sessions = await prisma.codeSession.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
    return sessions as unknown as PersistedSession[];
  } catch {
    return [];
  }
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  try {
    await prisma.codeSession.delete({ where: { id: sessionId } });
    return true;
  } catch {
    return false;
  }
}

export async function getSessionByShareToken(token: string): Promise<PersistedSession | null> {
  try {
    const session = await prisma.codeSession.findUnique({ where: { shareToken: token } });
    return session as unknown as PersistedSession | null;
  } catch {
    return null;
  }
}

export async function incrementExecutionCount(sessionId: string): Promise<void> {
  try {
    await prisma.codeSession.update({
      where: { id: sessionId },
      data: {
        executionCount: { increment: 1 },
        lastExecutedAt: new Date(),
      },
    });
  } catch {
    // Silently fail
  }
}

// ====== EXECUTION HISTORY ======

export async function saveExecution(exec: Omit<PersistedExecution, 'id' | 'createdAt'>): Promise<PersistedExecution> {
  try {
    const created = await prisma.codeExecution.create({ data: exec as any });
    return created as unknown as PersistedExecution;
  } catch {
    throw new Error('Failed to save execution');
  }
}

export async function getExecutionHistory(userId: string, limit = 100): Promise<PersistedExecution[]> {
  try {
    const executions = await prisma.codeExecution.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return executions as unknown as PersistedExecution[];
  } catch {
    return [];
  }
}

// ====== DEPLOYMENT PERSISTANCE ======

export async function saveDeployment(dep: Omit<PersistedDeployment, 'callCount' | 'lastCalled'>): Promise<PersistedDeployment> {
  try {
    const created = await prisma.codeDeployment.create({
      data: {
        ...dep as any,
        callCount: 0,
        allowedOrigins: dep.allowedOrigins || ['*'],
      },
    });
    return created as unknown as PersistedDeployment;
  } catch {
    throw new Error('Failed to save deployment');
  }
}

export async function getUserDeployments(userId: string): Promise<PersistedDeployment[]> {
  try {
    const deploys = await prisma.codeDeployment.findMany({
      where: { userId, active: true },
      orderBy: { createdAt: 'desc' },
    });
    return deploys as unknown as PersistedDeployment[];
  } catch {
    return [];
  }
}

export async function incrementDeploymentCallCount(deployId: string): Promise<void> {
  try {
    await prisma.codeDeployment.update({
      where: { id: deployId },
      data: {
        callCount: { increment: 1 },
        lastCalled: new Date(),
      },
    });
  } catch {
    // Silently fail
  }
}

export async function deactivateDeployment(deployId: string): Promise<boolean> {
  try {
    await prisma.codeDeployment.update({
      where: { id: deployId },
      data: { active: false },
    });
    return true;
  } catch {
    return false;
  }
}

export async function renewDeployment(deployId: string, days = 7): Promise<boolean> {
  try {
    const expiresAt = new Date(Date.now() + days * 86400000);
    await prisma.codeDeployment.update({
      where: { id: deployId },
      data: { expiresAt },
    });
    return true;
  } catch {
    return false;
  }
}