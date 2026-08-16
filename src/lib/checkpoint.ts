// ============================================================
// CHECKPOINT MANAGER — Sauvegarde et restauration d'état
// ============================================================

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export interface CheckpointData {
  agentId: string;
  sessionId: string;
  step: number;
  context: Record<string, unknown>;
  memory: Array<{ role: string; content: string; timestamp: string }>;
  actions: Array<{ action: string; input: unknown; output: unknown; timestamp: string; cost: number }>;
  totalCost: number;
  totalTokens: number;
  metadata?: Record<string, unknown>;
}

class CheckpointManager {
  private cache = new Map<string, CheckpointData>();

  async save(data: CheckpointData): Promise<void> {
    const key = `${data.agentId}:${data.sessionId}:${data.step}`;
    this.cache.set(key, data);

    try {
      await prisma.agentCheckpoint.upsert({
        where: {
          agentId_sessionId_step: {
            agentId: data.agentId,
            sessionId: data.sessionId,
            step: data.step,
          },
        },
        create: {
          agentId: data.agentId,
          sessionId: data.sessionId,
          step: data.step,
          context: data.context,
          memory: data.memory,
          actions: data.actions,
          totalCost: data.totalCost,
          totalTokens: data.totalTokens,
          metadata: data.metadata ?? null,
        },
        update: {
          context: data.context,
          memory: data.memory,
          actions: data.actions,
          totalCost: data.totalCost,
          totalTokens: data.totalTokens,
          metadata: data.metadata ?? null,
        },
      });
    } catch (error) {
      logger.error("checkpoint_save_failed", { key, error: String(error) });
    }
  }

  async restore(agentId: string, sessionId: string, step?: number): Promise<CheckpointData | null> {
    try {
      const checkpoint = await prisma.agentCheckpoint.findFirst({
        where: {
          agentId,
          sessionId,
          ...(step !== undefined ? { step } : {}),
        },
        orderBy: { step: "desc" },
      });

      if (!checkpoint) return null;

      return {
        agentId: checkpoint.agentId,
        sessionId: checkpoint.sessionId,
        step: checkpoint.step,
        context: checkpoint.context as Record<string, unknown>,
        memory: checkpoint.memory as Array<{ role: string; content: string; timestamp: string }>,
        actions: checkpoint.actions as Array<{ action: string; input: unknown; output: unknown; timestamp: string; cost: number }>,
        totalCost: checkpoint.totalCost,
        totalTokens: checkpoint.totalTokens,
        metadata: checkpoint.metadata as Record<string, unknown> | undefined,
      };
    } catch (error) {
      logger.error("checkpoint_restore_failed", { agentId, sessionId, error: String(error) });
      return null;
    }
  }

  getFromCache(agentId: string, sessionId: string, step: number): CheckpointData | undefined {
    return this.cache.get(`${agentId}:${sessionId}:${step}`);
  }

  async listSessions(agentId: string): Promise<string[]> {
    try {
      const checkpoints = await prisma.agentCheckpoint.findMany({
        where: { agentId },
        select: { sessionId: true },
// @ts-ignore — type narrowing pending, see refactor ticket
        distinct: ["sessionId"],
        orderBy: { createdAt: "desc" },
      });
      return checkpoints.map((c) => c.sessionId);
    } catch (error) {
      logger.error("checkpoint_list_failed", { agentId, error: String(error) });
      return [];
    }
  }

  async cleanOldSessions(agentId: string, keepLast: number = 10): Promise<void> {
    try {
      const sessions = await this.listSessions(agentId);
      if (sessions.length <= keepLast) return;

      const toDelete = sessions.slice(keepLast);
      await prisma.agentCheckpoint.deleteMany({
        where: {
          agentId,
          sessionId: { in: toDelete },
        },
      });
      logger.info("checkpoint_cleanup", { agentId, deleted: toDelete.length });
    } catch (error) {
      logger.error("checkpoint_cleanup_failed", { agentId, error: String(error) });
    }
  }
}

export const checkpointManager = new CheckpointManager();