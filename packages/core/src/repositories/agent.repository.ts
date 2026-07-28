import { BaseRepository } from './base.repository';

export interface AgentData {
  id: string; name: string; type: string; description: string;
  config: string; avatar: string | null; status: string;
  userId: string; createdAt: Date; updatedAt: Date;
}

export interface CreateAgentInput {
  name: string; type?: string; description?: string;
  config?: string; userId: string; status?: string;
}

export interface UpdateAgentInput {
  name?: string; type?: string; description?: string;
  config?: string; status?: string; avatar?: string;
}

class AgentRepository extends BaseRepository<AgentData, CreateAgentInput, UpdateAgentInput> {
  protected tableName = 'agent';
  async findByUserId(userId: string): Promise<AgentData[]> {
    return this.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }
  async findActiveByUserId(userId: string): Promise<AgentData[]> {
    return this.findMany({ where: { userId, status: 'active' }, orderBy: { createdAt: 'desc' } });
  }
  async findWithPermissions(agentId: string): Promise<any> {
    return this.findFirst({ id: agentId }, {
      permissions: { select: { permission: true, granted: true } },
      _count: { select: { memories: true } },
    });
  }
}

export const agentRepository = new AgentRepository();