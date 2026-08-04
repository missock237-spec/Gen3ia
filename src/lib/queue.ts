import { Queue, Worker, Job, QueueScheduler } from 'bullmq';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = { url: REDIS_URL };

// ============================================================
// Queue Definitions
// ============================================================

export const QUEUES = {
  EMAIL: 'genova:email',
  IMAGE_GENERATION: 'genova:image',
  VIDEO_GENERATION: 'genova:video',
  DOCUMENT_PROCESSING: 'genova:document',
  BACKUP: 'genova:backup',
  WEBHOOK: 'genova:webhook',
} as const;

// ============================================================
// Queue Factory
// ============================================================

function createQueue(name: string): Queue {
  return new Queue(name, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: {
        age: 86400, // 24h
        count: 100,
      },
      removeOnFail: {
        age: 604800, // 7 jours
      },
    },
  });
}

// ============================================================
// Worker Factory
// ============================================================

function createWorker(
  name: string,
  processor: (job: Job) => Promise<void>,
  concurrency: number = 5
): Worker {
  const worker = new Worker(name, processor, {
    connection,
    concurrency,
    lockDuration: 30000,
    stalledInterval: 30000,
    maxStalledCount: 3,
  });

  worker.on('completed', (job) => {
    console.log(`[Queue:${name}] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Queue:${name}] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error(`[Queue:${name}] Worker error:`, err.message);
  });

  return worker;
}

// ============================================================
// Email Queue
// ============================================================

export const emailQueue = createQueue(QUEUES.EMAIL);

export interface EmailJobData {
  to: string | string[];
  subject: string;
  html: string;
  type: 'welcome' | 'verification' | 'password-reset' | 'invoice' | 'notification';
  userId?: string;
}

export async function addEmailJob(data: EmailJobData): Promise<Job> {
  return emailQueue.add('send-email', data, {
    priority: data.type === 'password-reset' ? 1 : 5,
    attempts: data.type === 'welcome' ? 5 : 3,
  });
}

// ============================================================
// Image Generation Queue
// ============================================================

export const imageQueue = createQueue(QUEUES.IMAGE_GENERATION);

export interface ImageJobData {
  userId: string;
  prompt: string;
  model: string;
  width?: number;
  height?: number;
  provider: string;
}

export async function addImageJob(data: ImageJobData): Promise<Job> {
  return imageQueue.add('generate-image', data, {
    priority: 3,
    timeout: 120000, // 2 minutes max
  });
}

// ============================================================
// Document Processing Queue
// ============================================================

export const documentQueue = createQueue(QUEUES.DOCUMENT_PROCESSING);

export interface DocumentJobData {
  documentId: string;
  userId: string;
  fileName: string;
  fileType: string;
  content: string;
}

export async function addDocumentJob(data: DocumentJobData): Promise<Job> {
  return documentQueue.add('process-document', data, {
    priority: 4,
    timeout: 300000, // 5 minutes
  });
}


// ============================================================
// Queue Monitor
// ============================================================

export async function getQueueMetrics(): Promise<Record<string, {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}>> {
  const queues = [emailQueue, imageQueue, documentQueue];
  const metrics: Record<string, any> = {};

  for (const queue of queues) {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    metrics[queue.name] = { waiting, active, completed, failed, delayed };
  }

  return metrics;
}

// ============================================================
// Graceful Shutdown
// ============================================================

export async function shutdownQueues(): Promise<void> {
  await Promise.all([
    emailQueue.close(),
    imageQueue.close(),
    documentQueue.close(),
  ]);
}
