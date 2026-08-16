// ============================================================
// SUPERVISOR — Garde-fou contre les dérives d'agents
// ============================================================
// Limite les itérations, le coût, le temps d'exécution.
// Logs chaque décision de supervision dans SupervisorLog.
// ============================================================

import { prisma } from "./prisma";
import { logger } from "./logger";

export type SupervisorDecision = "continue" | "pause" | "stop";
export type SupervisorReason =
  | "iteration_limit"
  | "cost_limit"
  | "time_limit"
  | "token_limit"
  | "human_intervention"
  | "error_threshold"
  | "normal_progress";

export interface SupervisorResult {
  decision: SupervisorDecision;
  reason: SupervisorReason;
  message: string;
  iterationsLeft: number;
  costLeft: number;
}

export class Supervisor {
  async check(
    agentId: string,
    sessionId: string,
    iteration: number,
    currentCost: number,
    currentTokens: number,
    agentConfig: {
      maxIterations: number;
      maxCostLimit: number;
      maxTokens: number;
    },
  ): Promise<SupervisorResult> {
    const iterationsLeft = agentConfig.maxIterations - iteration;
    const costLeft = agentConfig.maxCostLimit - currentCost;

    let decision: SupervisorDecision = "continue";
    let reason: SupervisorReason = "normal_progress";
    let message = "";

    if (iteration >= agentConfig.maxIterations) {
      decision = "stop";
      reason = "iteration_limit";
      message = `Agent arrêté : ${iteration} itérations effectuées, maximum ${agentConfig.maxIterations} atteint.`;
    } else if (currentCost >= agentConfig.maxCostLimit) {
      decision = "stop";
      reason = "cost_limit";
      message = `Agent arrêté : coût ${currentCost.toFixed(4)}$ atteint, limite ${agentConfig.maxCostLimit}$ dépassée.`;
    } else if (currentTokens >= agentConfig.maxTokens) {
      decision = "stop";
      reason = "token_limit";
      message = `Agent arrêté : ${currentTokens} tokens utilisés, limite ${agentConfig.maxTokens} atteinte.`;
    } else if (iterationsLeft <= 3) {
      decision = "continue";
      message = `Attention : plus que ${iterationsLeft} itérations restantes.`;
    } else if (costLeft <= 0.05) {
      decision = "continue";
      message = `Attention : plus que ${(costLeft * 100).toFixed(1)} cents de budget restant.`;
    } else {
      message = `Agent en cours : itération ${iteration}/${agentConfig.maxIterations}, coût ${currentCost.toFixed(4)}$/${agentConfig.maxCostLimit}$.`;
    }

    await this.logSupervision(agentId, sessionId, iteration, decision, reason, currentCost, currentTokens);
    return { decision, reason, message, iterationsLeft, costLeft };
  }

  private async logSupervision(
    agentId: string,
    sessionId: string,
    iteration: number,
    decision: SupervisorDecision,
    reason: SupervisorReason,
    currentCost: number,
    currentTokens: number,
  ): Promise<void> {
    try {
      await prisma.supervisorLog.create({
        data: {
          agentId,
          sessionId,
          iteration,
          status: decision === "continue" ? "running" : decision === "pause" ? "paused" : "completed",
          currentCost,
          currentTokens,
          decision,
          reason,
          metadata: { timestamp: new Date().toISOString(), environment: process.env.NODE_ENV ?? "development" },
        },
      });
    } catch (error) {
      logger.error("supervisor_log_failed", {
        agentId,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async getHistory(agentId: string, sessionId: string) {
    try {
      return await prisma.supervisorLog.findMany({
        where: { agentId, sessionId },
        orderBy: { iteration: "asc" },
      });
    } catch (error) {
      logger.error("supervisor_history_failed", {
        agentId,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }
}

export const supervisor = new Supervisor();