import { Worker, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { createLogger, db } from '@gen3ia/core';

const log = createLogger('auto-worker');

const conn = new Redis(
  process.env.REDIS_URL ?? 'redis://localhost:6379',
  { maxRetriesPerRequest: null, retryStrategy: (t: number) => Math.min(t * 100, 3000) },
);

export const agentQueue = new Queue('agent-execution', {
  connection: conn,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 2000 },
    removeOnComplete: { age: 86400 },
    removeOnFail: { age: 172800 },
  },
});

const worker = new Worker('agent-execution', async (job) => {
  const { agentId, userId, input, executionId } = job.data;
  log.info('processing', { jobId: job.id, agentId });

  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: ['id', 'name', 'type', 'userId', 'status'],
  });
  if (!agent) throw new Error('Agent introuvable');
  if (agent.status === 'inactive') {
    log.warn('inactive', { agentId });
    return;
  }

  const user = await db.user.findUnique({ where: { id: userId }, select: ['credits'] });
  const currentCredits = Number((user as Record<string, unknown>)?.credits ?? 0);
  if (!user || currentCredits < 1) throw new Error('Credits insuffisants');

  let exec = executionId
    ? await db.agentExecution.findUnique({ where: { id: executionId } })
    : null;
  if (!exec) {
    exec = await db.agentExecution.create({
      data: {
        agentId,
        userId,
        task: String(input ?? '').slice(0, 500),
        status: 'running',
        provider: 'auto_scheduler',
        sessionId: null,
      },
    });
  } else {
    await db.agentExecution.update({ where: { id: exec.id as string }, data: { status: 'running' } });
  }

  const execId = exec.id as string;
  try {
    await new Promise((r) => setTimeout(r, 2000));
    const tokens = Math.floor(Math.random() * 400) + 100;
    await db.agentExecution.update({
      where: { id: execId },
      data: {
        status: 'completed',
        result: JSON.stringify({ output: '[Auto] ' + String(agent.name), tokens }),
        totalTokens: tokens,
        estimatedCost: tokens * 0.000002,
        completedAt: new Date(),
      },
    });
    // Lecture-ecriture atomique manuelle (pas de increment dans la facade)
    await db.user.update({
      where: { id: userId },
      data: { credits: Math.max(0, currentCredits - 1) },
    });
    log.info('completed', { jobId: job.id, tokens });
  } catch (e) {
    await db.agentExecution.update({
      where: { id: execId },
      data: { status: 'failed', error: String(e), completedAt: new Date() },
    }).catch(() => {});
    throw e;
  }
}, {
  connection: conn,
  concurrency: 5,
  limiter: { max: 10, duration: 1000 },
});

worker.on('completed', (j) => log.info('job_completed', { jobId: j.id }));
worker.on('failed', (j, e) => log.error('job_failed', { jobId: j?.id, error: e.message }));
worker.on('error', (e) => log.error('worker_error', { error: e.message }));
log.info('worker_started', { concurrency: 5 });

export default worker;
