import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export class WorkflowService {
  async create(data: { name: string; description: string; steps: string; trigger: string; userId: string }) {
    const workflow = await prisma.workflow.create({ data });
    logger.info("Workflow created", { workflowId: workflow.id });
    return workflow;
  }

  async getById(id: string) {
    const workflow = await prisma.workflow.findUnique({
      where: { id },
      include: { tasks: { orderBy: { createdAt: "desc" } } },
    });
    if (!workflow) throw new Error("Workflow non trouvé");
    return workflow;
  }

  async update(id: string, data: { name?: string; description?: string; steps?: string; status?: string }) {
    const workflow = await prisma.workflow.update({ where: { id }, data });
    logger.info("Workflow updated", { workflowId: id });
    return workflow;
  }

  async delete(id: string) {
    await prisma.workflow.delete({ where: { id } });
    logger.info("Workflow deleted", { workflowId: id });
  }

  async listByUser(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [workflows, total] = await Promise.all([
      prisma.workflow.findMany({
        where: { userId }, skip, take: limit,
        orderBy: { updatedAt: "desc" },
        include: { _count: { select: { tasks: true } } },
      }),
      prisma.workflow.count({ where: { userId } }),
    ]);
    return { workflows, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async execute(workflowId: string, userId: string) {
    const workflow = await this.getById(workflowId);
    const steps = JSON.parse(workflow.steps);
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      await prisma.task.create({
        data: { title: step.name || `Étape ${i + 1}`, status: "completed", workflowId, userId },
      });
    }
    await prisma.workflow.update({
      where: { id: workflowId },
      data: { status: "completed", currentTaskIndex: steps.length },
    });
    return { success: true, totalSteps: steps.length };
  }
}

export const workflowService = new WorkflowService();
