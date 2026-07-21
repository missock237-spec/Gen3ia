import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });

const autoWorker = new Worker("agent-execution", async (job) => {
  const { agentId, userId, input } = job.data;
  logger.info("auto_worker_processing", { jobId: job.id, agentId });
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw new Error(`Agent ${agentId} introuvable`);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
  if (!user || user.credits < 1) { logger.warn("auto_no_credits", { agentId }); return; }
  const execLog = await prisma.agentExecution.create({
    data: { agentId, userId, task: (input ?? "").slice(0, 500), status: "running", provider: "auto_scheduler" },
  });
  try {
    await new Promise((r) => setTimeout(r, 2000));
    await prisma.agentExecution.update({ where: { id: execLog.id }, data: { status: "completed", result: JSON.stringify({ output: `[Auto] ${agent.name}` }), totalTokens: 250, estimatedCost: 0.0005, completedAt: new Date() } });
    await prisma.user.update({ where: { id: userId }, data: { credits: { decrement: 1 } } });
    logger.info("auto_worker_completed", { jobId: job.id, executionId: execLog.id });
  } catch (error) {
    await prisma.agentExecution.update({ where: { id: execLog.id }, data: { status: "failed", error: String(error), completedAt: new Date() } });
    throw error;
  }
}, { connection, concurrency: 5, limiter: { max: 10, duration: 1000 } });

autoWorker.on("completed", (job) => logger.info("auto_job_completed", { jobId: job.id }));
autoWorker.on("failed", (job, error) => logger.error("auto_job_failed", { jobId: job?.id, error: error.message }));
logger.info("auto_worker_started");