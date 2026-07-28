// Auto Worker — BullMQ worker pour executions automatiques
// Ameliore: retry, debits, concurrency, gestion d'erreurs, logging structuré

import { Worker, Queue, Job } from 'bullmq';
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

interface AutoJobData {
  agentId: string;
  userId: string;
  input?: string;
  sessionId?: string;
  executionId?: string;
}

const autoWorker = new Worker<AutoJobData>('agent-execution', async (job: Job<AutoJobData>) => {
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
    throw new Error('Credits insuffisants');
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

  const startTime = Date.now();

  try {
    // Execution simulee (remplacer par appel LLM reel)
    await new Promise((r) => setTimeout(r, 2000));
    const duration = Date.now() - startTime;

    const tokenCount = Math.floor(Math.random() * 400) + 100;
    const cost = tokenCount * 0.000002;

    await db.agentExecution.update({
      where: { id: execLog.id },
      data: {
        status: 'completed',
        result: JSON.stringify({ output: `[Auto] ${agent.name} - execution periodique`, tokens: tokenCount, duration }),
        totalTokens: tokenCount,
        estimatedCost: cost,
        completedAt: new Date(),
      },
    });

    // Deduire 1 credit (condition atomique)
    const updatedUser = await db.user.update({
      where: { id: userId, credits: { gte: 1 } },
      data: { credits: { decrement: 1 } },
      select: { credits: true },
    });

    // Logger les metriques de performance
    log.info('auto_worker_completed', {
      jobId: job.id,
      executionId: execLog.id,
      tokens: tokenCount,
      cost,
      duration,
      remainingCredits: updatedUser.credits,
      attempt: job.attemptsMade,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    await db.agentExecution.update({
      where: { id: execLog.id },
      data: { status: 'failed', error: errMsg, completedAt: new Date() },
    }).catch(() => {});
    throw error; // BullMQ retry automatique
  }
}, {
  connection,
  concurrency: 5,
  limiter: { max: 10, duration: 1000 },
});

autoWorker.on('completed', (job: Job) => {
  const duration = job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : 0;
  log.info('auto_job_completed', { jobId: job.id, duration, queue: 'agent-execution' });
});

autoWorker.on('failed', (job: Job | undefined, error: Error) => {
  log.error('auto_job_failed', {
    jobId: job?.id,
    error: error.message,
    attempts: job?.attemptsMade,
    queue: 'agent-execution',
  });
});

autoWorker.on('error', (error: Error) => {
  log.error('auto_worker_error', { error: error.message });
});

log.info('auto_worker_started', { concurrency: 5, queue: 'agent-execution' });

export default autoWorker;
