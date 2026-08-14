// ============================================================
// AGENT SPECIALIZATION — Creation d'agents specialises
// Instructions, outils, modeles personnalises + Marketplace
// ============================================================
import { prisma } from './prisma';
import { createLogger } from './logger';

const log = createLogger('agent-specialization');

export interface CreateAgentInput {
  name: string;
  description?: string;
  instructions: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  category?: string;
  tags?: string[];
  tools?: AgentToolInput[];
}

export interface AgentToolInput {
  name: string;
  description: string;
  type: 'function' | 'api' | 'webhook' | 'mcp';
  config: Record<string, any>;
}

export class AgentSpecialization {
  async createAgent(userId: string, input: CreateAgentInput) {
    const toolsData = (input.tools || []).map(t => ({
      name: t.name,
      description: t.description,
      type: t.type,
      config: JSON.stringify(t.config),
    }));

    const agent = await prisma.agent.create({
      data: {
        name: input.name,
        description: input.description || '',
        instructions: input.instructions,
        systemPrompt: input.systemPrompt || this.buildSystemPrompt(input),
        model: input.model || 'gpt-4o-mini',
        temperature: input.temperature ?? 0.7,
        maxTokens: input.maxTokens ?? 4096,
        type: 'custom',
        role: this.inferRole(input),
        status: 'active',
        category: input.category || 'custom',
        tags: JSON.stringify(input.tags || []),
        ownerId: userId,
        tools: toolsData.length > 0 ? { create: toolsData } : undefined,
      },
      include: { tools: true },
    });

    log.info('agent_created', { agentId: agent.id, name: agent.name });
    return agent;
  }

  async updateAgent(agentId: string, userId: string, input: Partial<CreateAgentInput>) {
    const agent = await prisma.agent.findFirst({ where: { id: agentId, ownerId: userId } });
    if (!agent) throw new Error('Agent introuvable');

    if (input.tools) {
      await prisma.agentTool.deleteMany({ where: { agentId } });
      await prisma.agentTool.createMany({
        data: input.tools.map(t => ({
          agentId, name: t.name, description: t.description,
          type: t.type, config: JSON.stringify(t.config),
        })),
      });
    }

    const updated = await prisma.agent.update({
      where: { id: agentId },
      data: {
        ...(input.name && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.instructions && { instructions: input.instructions, systemPrompt: input.systemPrompt || this.buildSystemPrompt(input as CreateAgentInput) }),
        ...(input.model && { model: input.model }),
        ...(input.temperature !== undefined && { temperature: input.temperature }),
        ...(input.maxTokens !== undefined && { maxTokens: input.maxTokens }),
        ...(input.category && { category: input.category }),
        ...(input.tags && { tags: JSON.stringify(input.tags) }),
      },
      include: { tools: true },
    });

    return updated;
  }

  async publishToMarketplace(agentId: string, userId: string) {
    const agent = await prisma.agent.findFirst({
      where: { id: agentId, ownerId: userId },
      include: { tools: true },
    });
    if (!agent) throw new Error('Agent introuvable');

    const updated = await prisma.agent.update({
      where: { id: agentId },
      data: { isMarketplacePublished: true, isPublic: true, status: 'published' },
    });

    // Also create marketplace listing
    await prisma.marketplaceListing.upsert({
      where: { agentId: agentId },
      update: { isActive: true },
      create: {
        title: agent.name,
        description: agent.description || agent.instructions.slice(0, 200),
        type: 'agent_template',
        price: 0,
        creatorId: userId,
        agentId: agent.id,
        tags: JSON.parse(agent.tags || '[]'),
        isActive: true,
      },
    });

    log.info('agent_published_marketplace', { agentId });
    return updated;
  }

  async getAgents(userId: string, options?: { category?: string; includePublic?: boolean }) {
    const where: any = {
      OR: [{ ownerId: userId }],
    };
    if (options?.includePublic) {
      where.OR.push({ isPublic: true });
    }
    if (options?.category) {
      where.category = options.category;
    }

    return prisma.agent.findMany({
      where,
      include: { tools: true, _count: { select: { delegationsReceived: true, delegationsMade: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getMarketplaceAgents(filters?: { category?: string; search?: string }) {
    const where: any = { isMarketplacePublished: true, status: 'published' };
    if (filters?.category) where.category = filters.category;
    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    return prisma.agent.findMany({
      where,
      include: { tools: true, owner: { select: { name: true, avatar: true } } },
      orderBy: { usageCount: 'desc' },
    });
  }

  async cloneMarketplaceAgent(agentId: string, userId: string) {
    const source = await prisma.agent.findUnique({
      where: { id: agentId },
      include: { tools: true },
    });
    if (!source || !source.isPublic) throw new Error('Agent introuvable ou non public');

    const cloned = await prisma.agent.create({
      data: {
        name: source.name + ' (clone)',
        description: source.description,
        instructions: source.instructions,
        systemPrompt: source.systemPrompt,
        model: source.model,
        temperature: source.temperature,
        maxTokens: source.maxTokens,
        type: 'custom',
        role: source.role,
        status: 'active',
        category: 'cloned',
        tags: source.tags,
        ownerId: userId,
        tools: source.tools.length > 0 ? {
          create: source.tools.map(t => ({
            name: t.name, description: t.description,
            type: t.type, config: t.config,
          })),
        } : undefined,
      },
      include: { tools: true },
    });

    // Increment usage
    await prisma.agent.update({ where: { id: agentId }, data: { usageCount: { increment: 1 } } });

    log.info('agent_cloned', { sourceId: agentId, cloneId: cloned.id });
    return cloned;
  }

  private buildSystemPrompt(input: CreateAgentInput): string {
    return `Tu es un agent specialise: ${input.name}.\n\n${input.description || ''}\n\nInstructions:\n${input.instructions}\n\nComporte-toi comme un expert dans ton domaine. Utilise les outils a ta disposition pour accomplir tes taches.`;
  }

  private inferRole(input: CreateAgentInput): string {
    const keywords: Record<string, string> = {
      analyse: 'analyst', 'research': 'researcher', 'recherche': 'researcher',
      write: 'writer', 'ecrit': 'writer', 'redact': 'writer',
      code: 'coder', 'developp': 'coder', 'program': 'coder',
      review: 'reviewer', 'relire': 'reviewer', 'critiqu': 'critic',
      coordin: 'coordinator', 'supervis': 'coordinator',
    };
    const text = (input.name + ' ' + input.description + ' ' + input.instructions).toLowerCase();
    for (const [keyword, role] of Object.entries(keywords)) {
      if (text.includes(keyword)) return role;
    }
    return 'custom';
  }
}

export const agentSpecialization = new AgentSpecialization();
export default agentSpecialization;