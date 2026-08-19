/**
 * BullMQ Queue — Re-export from queue/bullmq-queue for backward compatibility
 * Uses lazy initialization to avoid Redis connection at build time
 */
export { BullMQQueue, JobPriority } from './queue/bullmq-queue';
export type { QueueName, BaseJobPayload, ImageJobPayload, VideoJobPayload, AIJobPayload, AnyJobPayload, JobResult, QueueStats, JobStatusResult } from './queue/bullmq-queue';

import { BullMQQueue } from './queue/bullmq-queue';

let _agentQueue: BullMQQueue | null = null;

export function getAgentQueue(): BullMQQueue {
  if (!_agentQueue) {
    _agentQueue = new BullMQQueue();
  }
  return _agentQueue;
}

// Lazy getter — does NOT instantiate at module load time
export const agentQueue = new Proxy({} as BullMQQueue, {
  get(_target, prop, receiver) {
    const queue = getAgentQueue();
    const value = Reflect.get(queue, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(queue);
    }
    return value;
  },
});
