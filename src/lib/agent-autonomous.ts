// Agent Autonomous Run Manager
// Gère les exécutions autonomes d'agents (start, pause, resume, cancel, checkpoint)

import { prisma } from '@/lib/prisma';

export const agentAutonomous = {
  async startRun(params: {
    agentId: string;
    userId: string;
    goal: string;
    instructions?: string;
    schedule?: string;
    maxDurationMs?: number;
    checkpoints?: any[];
  }) {
    const run = await prisma.autonomousRun.create({
      data: {
        agentId: params.agentId,
        userId: params.userId,
        goal: params.goal,
        instructions: params.instructions || '',
        schedule: params.schedule || '',
        maxDurationMs: params.maxDurationMs || 3600000,
        checkpointsConfig: JSON.stringify(params.checkpoints || []),
        status: 'pending',
        progress: '[]',
      },
    });
    return run;
  },

  async pauseRun(runId: string, reason?: string) {
    const run = await prisma.autonomousRun.update({
      where: { id: runId },
      data: {
        status: 'paused',
        pausedAt: new Date(),
        progress: JSON.stringify({ pausedReason: reason || 'User requested' }),
      },
    });
    return run;
  },

  async resumeRun(runId: string) {
    const run = await prisma.autonomousRun.update({
      where: { id: runId },
      data: {
        status: 'running',
        pausedAt: null,
      },
    });
    return run;
  },

  async cancelRun(runId: string) {
    const run = await prisma.autonomousRun.update({
      where: { id: runId },
      data: {
        status: 'cancelled',
        completedAt: new Date(),
      },
    });
    return run;
  },

  async decideCheckpoint(checkpointId: string, userId: string, decision: string, note?: string) {
    const checkpoint = await prisma.agentCheckpoint.update({
      where: { id: checkpointId },
      data: {
        status: decision === 'approve' ? 'approved' : 'rejected',
        decision: decision,
        decidedBy: userId,
        decidedAt: new Date(),
        context: JSON.stringify({ note: note || '' }),
      },
    });
    return { checkpoint };
  },

  async getRunStatus(runId: string) {
    const run = await prisma.autonomousRun.findUnique({
      where: { id: runId },
      include: {
        checkpoints: true,
        agent: { select: { id: true, name: true, type: true } },
      },
    });
    return run;
  },

  async getAgentRuns(agentId: string) {
    const runs = await prisma.autonomousRun.findMany({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return runs;
  },
};
