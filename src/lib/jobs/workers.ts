import { Job } from "bullmq";
import { logger } from "@/lib/logger";
import { QueueName, queueManager, JobData, JobResult } from "./index";

export const agentWorker = queueManager.registerWorker(
  QueueName.AGENT_TASKS,
  async (job: Job<JobData>): Promise<JobResult> => {
    const { type } = job.data;
    switch (type) {
      case "process_instruction":
        return { success: true, data: { message: "Instruction traitée" } };
      case "memory_consolidation":
        return { success: true, data: { message: "Mémoire consolidée" } };
      default:
        return { success: false, error: `Type inconnu: ${type}` };
    }
  },
  3
);

export const llmWorker = queueManager.registerWorker(
  QueueName.LLM_INFERENCE,
  async (job: Job<JobData>): Promise<JobResult> => {
    const { type } = job.data;
    switch (type) {
      case "generate_response":
        return { success: true, data: { response: "Réponse générée" } };
      case "embedding":
        return { success: true, data: { vector: [] } };
      default:
        return { success: false, error: `Type inconnu: ${type}` };
    }
  },
  2
);

export const webhookWorker = queueManager.registerWorker(
  QueueName.WEBHOOKS,
  async (job: Job<JobData>): Promise<JobResult> => {
    const { type, payload } = job.data;
    switch (type) {
      case "emit":
        return { success: true, data: { webhookId: payload.webhookId, status: "emitted" } };
      default:
        return { success: false, error: `Type inconnu: ${type}` };
    }
  },
  10
);

export function initWorkers(): void {
  agentWorker;
  llmWorker;
  webhookWorker;
  queueManager.getQueue(QueueName.AGENT_TASKS);
  queueManager.getQueue(QueueName.LLM_INFERENCE);
  queueManager.getQueue(QueueName.WEBHOOKS);
  queueManager.getQueue(QueueName.EMBEDDINGS);
  queueManager.getQueue(QueueName.EMAIL);
  logger.info("All workers initialized");
}

export async function shutdownWorkers(): Promise<void> {
  await queueManager.shutdown();
  logger.info("All workers shut down");
}
