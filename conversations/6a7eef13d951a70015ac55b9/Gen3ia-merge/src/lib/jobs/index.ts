import { Job, Worker, Queue } from "bullmq";
import { Redis } from "ioredis";
import { logger } from "@/lib/logger";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let redisClient: Redis | null = null;

function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });
  }
  return redisClient;
}

export enum QueueName {
  AGENT_TASKS = "agent-tasks",
  LLM_INFERENCE = "llm-inference",
  WEBHOOKS = "webhooks",
  EMBEDDINGS = "embeddings",
  EMAIL = "email",
}

interface JobData {
  type: string;
  payload: Record<string, unknown>;
  userId?: string;
  agentId?: string;
}

interface JobResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

class QueueManager {
  private queues = new Map<QueueName, Queue>();
  private workers = new Map<QueueName, Worker>();

  getQueue(name: QueueName): Queue {
    if (!this.queues.has(name)) {
      const queue = new Queue(name, {
        connection: getRedis(),
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 1000 },
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 50 },
        },
      });
      this.queues.set(name, queue);
    }
    return this.queues.get(name)!;
  }

  async add(name: QueueName, data: JobData, opts?: { delay?: number; priority?: number }): Promise<string> {
    const queue = this.getQueue(name);
    const job = await queue.add(data.type, data, {
      delay: opts?.delay,
      priority: opts?.priority,
    });
    logger.info(`Job added to ${name}`, { jobId: job.id, type: data.type });
// @ts-ignore
    return job.id;
  }

  registerWorker(
    name: QueueName,
    handler: (job: Job<JobData>) => Promise<JobResult>,
    concurrency = 5
  ): Worker {
    if (this.workers.has(name)) {
      return this.workers.get(name)!;
    }

    const worker = new Worker<JobData, JobResult>(
      name,
      async (job) => {
        logger.info(`Processing job ${job.id}`, { type: job.data.type, queue: name });
        try {
          const result = await handler(job);
          logger.info(`Job ${job.id} completed`, { success: result.success });
          return result;
        } catch (error) {
          logger.error(`Job ${job.id} failed`, { error });
          return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
        }
      },
      {
        connection: getRedis(),
        concurrency,
        lockDuration: 30000,
      }
    );

    worker.on("failed", (job, err) => {
      logger.error(`Worker job failed`, { jobId: job?.id, error: err.message });
    });

    this.workers.set(name, worker);
    return worker;
  }

  async shutdown(): Promise<void> {
    for (const [, worker] of this.workers) {
      await worker.close();
    }
    for (const [, queue] of this.queues) {
      await queue.close();
    }
    if (redisClient) {
      redisClient.disconnect();
    }
  }

  async healthCheck(): Promise<Record<string, boolean>> {
    const status: Record<string, boolean> = {};
    for (const [name] of this.queues) {
      try {
        const queue = this.getQueue(name);
        await queue.getJobCounts();
        status[name] = true;
      } catch {
        status[name] = false;
      }
    }
    return status;
  }
}

export const queueManager = new QueueManager();
export type { JobData, JobResult };
