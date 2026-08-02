/**
 * BullMQ Queue — Re-export from queue/bullmq-queue for backward compatibility
 */
export { BullMQQueue, JobPriority } from './queue/bullmq-queue';
export type { QueueName, BaseJobPayload, ImageJobPayload, VideoJobPayload, AIJobPayload, AnyJobPayload, JobResult, QueueStats, JobStatusResult } from './queue/bullmq-queue';

// Singleton agent queue instance
import { BullMQQueue } from './queue/bullmq-queue';

let _agentQueue: BullMQQueue | null = null;

export function getAgentQueue(): BullMQQueue {
  if (!_agentQueue) {
    _agentQueue = new BullMQQueue();
  }
  return _agentQueue;
}

export const agentQueue = getAgentQueue();
