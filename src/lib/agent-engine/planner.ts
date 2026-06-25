import { chatCompletion } from '@/lib/ai-router';
import { db } from '@/lib/db';

export interface MultiAgentPlan {
  id: string;
  objective: string;
  agents: Array<{
    agentId: string;
    role: string;
    task: string;
    dependencies: string[];
  }>;
  status: 'planning' | 'executing' | 'completed' | 'failed';
  results: Record<string, any>;
  createdAt: string;
}

export async function decomposeTask(
  objective: string,
  agentIds: string[],
  userId: string
): Promise<MultiAgentPlan> {
  const agents = await db.agent.findMany({
    where: { id: { in: agentIds }, userId, status: 'active' },
  });

  if (agents.length === 0) throw new Error('Aucun agent actif');

  return {
    id: `plan_${Date.now()}`,
    objective,
    agents: agents.map(a => ({ agentId: a.id, role: a.type, task: objective, dependencies: [] })),
    status: 'planning',
    results: {},
    createdAt: new Date().toISOString()
  };
}
