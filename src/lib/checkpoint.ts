// ============================================================
// CHECKPOINT MANAGER — Reprise sur panne des agents
// ============================================================
// Persiste l'état complet à chaque étape de la boucle ReAct.
// En cas de panne (crash, timeout, erreur API), l'agent peut
// reprendre exactement là où il s'est arrêté sans perte de crédits.
// ============================================================

import { prisma } from "./prisma";
import { logger } from "./logger";

export interface CheckpointState {
  agentId: string;
  sessionId: string;
  step: number;
  context: Record<string, unknown>;
  memory: Array<{ role: string; content: string; timestamp: string }>;
  actions: Array<{
    action: string;
    input: unknown;
    output: unknown;
    timestamp: string;
    cost: number;
  }>;
  totalCost: number;
  totalTokens: number;
  metadata?: Record<string, unknown>;
}

export class CheckpointManager {
  async save(state: CheckpointState): Promise<void> {
    const start = performance.now();
    try {
      await prisma.agentCheckpoint.upsert({
        where: {
          agentId_sessionId_step: {
            agentId: state.agentId,
            sessionId: state.sessionId,
            step: state.step,
          },
        },
        update: {
          context: state.context,
          memory: state.memory,
          actions: state.actions,
          totalCost: state.totalCost,
          totalTokens: state.totalTokens,
          metadata: state.metadata ?? {},
        },
        create: {
          agentId: state.agentId,
          sessionId: state.sessionId,
          step: state.step,
          context: state.context,
          memory: state.memory,
          actions: state.actions,
          totalCost: state.totalCost,
          totalTokens: state.totalTokens,
          metadata: state.metadata ?? {},
        },
      });
      logger.info("checkpoint_saved", {
        agentId: state.agentId,
        sessionId: state.sessionId,
        step: state.step,
        totalCost: state.totalCost,
        totalTokens: state.totalTokens,
        durationMs: Math.round(performance.now() - start),
      });
    } catch (error) {
      logger.error("checkpoint_save_failed", {
        agentId: state.agentId,
        sessionId: state.sessionId,
        step: state.step,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async getLatest(agentId: string, sessionId: string): Promise<CheckpointState | null> {
    try {
      const cp = await prisma.agentCheckpoint.findFirst({
        where: { agentId, sessionId },
        orderBy: { step: "desc" },
      });
      if (!cp) return null;
      return {
        agentId: cp.agentId,
        sessionId: cp.sessionId,
        step: cp.step,
        context: cp.context as Record<string, unknown>,
        memory: cp.memory as Array<{ role: string; content: string; timestamp: string }>,
        actions: cp.actions as Array<{ action: string; input: unknown; output: unknown; timestamp: string; cost: number }>,
        totalCost: cp.totalCost,
        totalTokens: cp.totalTokens,
        metadata: cp.metadata as Record<string, unknown> | undefined,
      };
    } catch (error) {
      logger.error("checkpoint_load_failed", {
        agentId,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async resume(agentId: string, sessionId: string): Promise<{
    state: CheckpointState | null;
    hasHistory: boolean;
    stepsDone: number;
  }> {
    const state = await this.getLatest(agentId, sessionId);
    if (!state) {
      return { state: null, hasHistory: false, stepsDone: 0 };
    }
    logger.info("agent_resumed_from_checkpoint", {
      agentId,
      sessionId,
      fromStep: state.step,
      actionsDone: state.actions.length,
      totalCost: state.totalCost,
      totalTokens: state.totalTokens,
    });
    return { state, hasHistory: true, stepsDone: state.step };
  }

  async cleanup(agentId: string, sessionId: string): Promise<void> {
    try {
      const { count } = await prisma.agentCheckpoint.deleteMany({
        where: { agentId, sessionId },
      });
      logger.info("checkpoint_cleanup_done", { agentId, sessionId, deletedCount: count });
    } catch (error) {
      logger.error("checkpoint_cleanup_failed", {
        agentId,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export const checkpointManager = new CheckpointManager();