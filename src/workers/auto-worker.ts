// Auto Worker — BullMQ worker pour executions automatiques

import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';

const log = createLogger('auto-worker');

const connection = new Redis(
  process.env.REDIS_URL ?? 'redis://localhost:6379',
  { maxRetriesPerRequest: null }
);

const autoWorker = new Worker('agent-execution', async (job) => {
  const { agentId, userId, input, sessionId } = job.data;

  log.info('auto_worker_processing', { jobId: job.id, agentId });

  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: { id: true, name: true, type: true, userId: true },
  });

  if (!agent) throw new Error(`Agent ${agentId} introuvable`);

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { credits: true },
  });

  if (!user || user.credits < 1) {
    log.warn('auto_no_credits', { agentId });
    return;
  }

  const execLog = await db.agentExecution.create({
    data: {
      agentId,
      userId,
      task: (input ?? '').slice(0, 500),
      status: 'running',
      provider: 'auto_scheduler',
      sessionId: sessionId || null,
    },
  });

  try {
    // Simulation d'execution
    await new Promise((r) => setTimeout(r, 2000));

    await db.agentExecution.update({
      where: { id: execLog.id },
      data: {
        status: 'completed',
        result: JSON.stringify({ output: `[Auto] ${agent.name} - execution periodique` }),
        totalTokens: 250,
        estimatedCost: 0.0005,
        completedAt: new Date(),
      },
    });

    await db.user.update({
      where: { id: userId },
      data: { credits: { decrement: 1 } },
    });

    log.info('auto_worker_completed', { jobId: job.id, executionId: execLog.id });
  } catch (error) {
    await db.agentExecution.update({
      where: { id: execLog.id },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
      },
    });
    throw error;
  }
}, {
  connection,
  concurrency: 5,
  limiter: { max: 10, duration: 1000 },
});

autoWorker.on('completed', (job) => {
  log.info('auto_job_completed', { jobId: job.id });
});

autoWorker.on('failed', (job, error) => {
  log.error('auto_job_failed', {
    jobId: job?.id,
    error: error.message,
  });
});

log.info('auto_worker_started');

export default autoWorker;
