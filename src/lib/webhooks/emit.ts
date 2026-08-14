import { webhookManager } from "./webhook-manager";
import { logger } from "@/lib/logger";

export async function emitAgentEvent(eventType, userId, data) {
  try {
    await webhookManager.emit(eventType, userId, { ...data, timestamp: new Date().toISOString(), eventType, environment: process.env.NODE_ENV || "development" });
  } catch (e) {
    logger.error("Webhook emit fail", { eventType, userId, error: e instanceof Error ? e.message : "unknown" });
  }
}

export async function emitAgentCompletion(agentId, userId, success, result, duration) {
  await emitAgentEvent(success ? "agent.action.completed" : "agent.action.failed", userId, { agentId, result, duration, status: success ? "completed" : "failed" });
}

export async function emitFeedbackReceived(agentId, userId, rating) {
  await emitAgentEvent("agent.feedback.received", userId, { agentId, rating });
}

export async function emitScheduledTriggered(taskId, userId, taskName) {
  await emitAgentEvent("agent.scheduled.triggered", userId, { taskId, taskName });
}
