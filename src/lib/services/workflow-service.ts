import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export class WorkflowService {
  async create(data: { name: string; description: string; steps: string; trigger: string; userId: string }) {
    const w = await prisma.workflow.create({ data });
    logger.info('Workflow created', { workflowId: w.id });
    return w;
  }

  async getById(id: string) {
    const w = await prisma.workflow.findUnique({ where: { id }, include: { tasks: { orderBy: { createdAt: 'desc' } } } });
    if (!w) throw new Error('Workflow non trouve');
    return w;
  }

  async update(id: string, data: any) {
    return prisma.workflow.update({ where: { id }, data });
  }

  async delete(id: string) { await prisma.workflow.delete({ where: { id } }); }

  async listByUser(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [workflows, total] = await Promise.all([
      prisma.workflow.findMany({ where: { userId }, skip, take: limit, orderBy: { updatedAt: 'desc' }, include: { _count: { select: { tasks: true } } } }),
      prisma.workflow.count({ where: { userId } }),
    ]);
    return { workflows, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async execute(workflowId: string, userId: string) {
    const workflow = await this.getById(workflowId);
    const steps = JSON.parse(workflow.steps);
    for (let i = 0; i < steps.length; i++) {
      await prisma.task.create({ data: { title: steps[i].name || 'Etape ' + (i+1), status: 'completed', workflowId, userId } });
    }
    await prisma.workflow.update({ where: { id: workflowId }, data: { status: 'completed', currentTaskIndex: steps.length } });
    return { success: true, totalSteps: steps.length };
  }
}

export const workflowService = new WorkflowService();
