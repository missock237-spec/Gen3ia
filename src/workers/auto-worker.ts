// Auto Worker — BullMQ worker pour executions automatiques
// Ameliore: retry, debits, concurrency, gestion d'erreurs, logging structuré

import { Worker, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';

const log = createLogger('auto-worker');

const connection = new Redis(
  process.env.REDIS_URL ?? 'redis://localhost:6379',
  { maxRetriesPerRequest: null, retryStrategy: (times) => Math.min(times * 100, 3000) }
);

export const agentQueue = new Queue('agent-execution', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 3600 * 24 },
    removeOnFail: { age: 3600 * 48 },
  },
});

const autoWorker = new Worker('agent-execution', async (job) => {
  const { agentId, userId, input, sessionId, executionId } = job.data;

  log.info('auto_worker_processing', { jobId: job.id, agentId, attempt: job.attemptsMade });

  // Verifier que l'agent existe
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: { id: true, name: true, type: true, userId: true, status: true },
  });

  if (!agent) throw new Error(`Agent ${agentId} introuvable`);
  if (agent.status === 'inactive') {
    log.warn('auto_agent_inactive', { agentId });
    return;
  }

  // Verifier les credits
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { credits: true, plan: true },
  });

  if (!user || (user.credits ?? 0) < 1) {
    log.warn('auto_no_credits', { agentId, userId });
    throw new Error('Crédits insuffisants');
  }

  // Creer ou recuperer l'execution
  let execLog;
  if (executionId) {
    execLog = await db.agentExecution.findUnique({ where: { id: executionId } });
  }

  if (!execLog) {
    execLog = await db.agentExecution.create({
      data: {
        agentId, userId,
        task: (input ?? '').slice(0, 500),
        status: 'running',
        provider: 'auto_scheduler',
        sessionId: sessionId || null,
      },
    });
  } else {
    await db.agentExecution.update({
      where: { id: execLog.id },
      data: { status: 'running' },
    });
  }

  try {
    // Execution simulee (remplacer par appel LLM reel)
    const startTime = Date.now();
    await new Promise((r) => setTimeout(r, 2000));
    const duration = Date.now() - startTime;

    const tokens = Math.floor(Math.random() * 400) + 100;
    const cost = tokens * 0.000002;

    await db.agentExecution.update({
      where: { id: execLog.id },
      data: {
        status: 'completed',
        result: JSON.stringify({ output: `[Auto] ${agent.name} - execution periodique`, tokens, duration }),
        totalTokens: tokens,
        estimatedCost: cost,
        completedAt: new Date(),
      },
    });

    // Deduire 1 credit
    await db.user.update({
      where: { id: userId, credits: { gte: 1 } },
      data: { credits: { decrement: 1 } },
    });

    log.info('auto_worker_completed', {
      jobId: job.id,
      executionId: execLog.id,
      tokens,
      cost,
      duration,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    await db.agentExecution.update({
      where: { id: execLog.id },
      data: { status: 'failed', error: errMsg, completedAt: new Date() },
    }).catch(() => {});
    throw error;
  }
}, {
  connection,
  concurrency: 5,
  limiter: { max: 10, duration: 1000 },
});

autoWorker.on('completed', (job) => {
  log.info('auto_job_completed', { jobId: job.id, duration: job.finishedOn! - job.processedOn! });
});

autoWorker.on('failed', (job, error) => {
  log.error('auto_job_failed', { jobId: job?.id, error: error.message, attempts: job?.attemptsMade });
});

autoWorker.on('error', (error) => {
  log.error('auto_worker_error', { error: error.message });
});

log.info('auto_worker_started', { concurrency: 5, queue: 'agent-execution' });

export default autoWorker;
