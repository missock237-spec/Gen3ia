import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

interface CreateAgentInput {
  name: string;
  type: string;
  description: string;
  config?: string;
  avatar?: string;
  userId: string;
}

interface UpdateAgentInput {
  name?: string;
  description?: string;
  config?: string;
  status?: string;
  avatar?: string;
}

export class AgentService {
  async create(data: CreateAgentInput) {
    const agent = await prisma.agent.create({
      data: {
        name: data.name,
        type: data.type,
        description: data.description,
        config: data.config || "{}",
        avatar: data.avatar,
        userId: data.userId,
      },
      include: { permissions: true },
    });
    logger.info("Agent created", { agentId: agent.id, userId: data.userId });
    return agent;
  }

  async getById(id: string) {
    const agent = await prisma.agent.findUnique({
      where: { id },
      include: {
        permissions: true,
        memories: { take: 5, orderBy: { createdAt: "desc" } },
        executions: { take: 5, orderBy: { createdAt: "desc" } },
      },
    });
    if (!agent) throw new Error("Agent non trouvé");
    return agent;
  }

  async update(id: string, data: UpdateAgentInput) {
// @ts-ignore
    const agent = await prisma.agent.update({ where: { id }, data });
    logger.info("Agent updated", { agentId: id });
    return agent;
  }

  async delete(id: string) {
    await prisma.agent.delete({ where: { id } });
    logger.info("Agent deleted", { agentId: id });
  }

  async listByUser(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [agents, total] = await Promise.all([
      prisma.agent.findMany({
        where: { userId }, skip, take: limit,
        orderBy: { updatedAt: "desc" },
        include: { _count: { select: { tasks: true, memories: true, executions: true } } },
      }),
      prisma.agent.count({ where: { userId } }),
    ]);
    return { agents, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async executeAction(agentId: string, action: string, params: Record<string, unknown>, userId: string) {
    const log = await prisma.agentActionLog.create({
      data: { agentId, action, details: JSON.stringify(params), status: "running", userId },
    });
    try {
      const result = await this.runAction(action, params);
      await prisma.agentActionLog.update({
        where: { id: log.id },
        data: { status: "completed", result: JSON.stringify(result), resolvedAt: new Date() },
      });
      return { success: true, result, logId: log.id };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : "Erreur inconnue";
      await prisma.agentActionLog.update({
        where: { id: log.id },
        data: { status: "failed", result: errorMsg, resolvedAt: new Date() },
      });
      return { success: false, error: errorMsg, logId: log.id };
    }
  }

  private async runAction(action: string, params: Record<string, unknown>): Promise<unknown> {
    switch (action) {
      case "search": return { results: `Résultats pour: ${params.query || ""}` };
      case "browse": return { page: params.url || "", status: "loaded" };
      case "email_send": return { sent: true, to: params.to, subject: params.subject };
      case "slack_message": return { sent: true, channel: params.channel || "general" };
      default: throw new Error(`Action non supportée: ${action}`);
    }
  }

  async getStats(userId: string) {
    const [total, active, totalExecutions, totalMemories] = await Promise.all([
      prisma.agent.count({ where: { userId } }),
      prisma.agent.count({ where: { userId, status: "active" } }),
      prisma.agentActionLog.count({ where: { userId } }),
      prisma.agentMemory.count({ where: { userId } }),
    ]);
    return { total, active, inactive: total - active, totalExecutions, totalMemories };
  }
}

export const agentService = new AgentService();
