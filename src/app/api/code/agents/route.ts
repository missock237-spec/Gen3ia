// API REST pour les agents autonomes
import { NextRequest, NextResponse } from 'next/server';
import { autonomousAgent } from '@/lib/code-engine/web-agent-core';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, userId, agentId, name } = body;

    switch (action) {
      case 'create': {
        if (!userId || !name) {
          return NextResponse.json({ error: 'userId et name requis' }, { status: 400 });
        }
        const agent = autonomousAgent.create(userId, name);
        return NextResponse.json({ agent: { id: agent.id, name: agent.name, status: agent.status, createdAt: agent.createdAt } }, { status: 201 });
      }

      case 'execute': {
        if (!agentId || !body.agentAction) {
          return NextResponse.json({ error: 'agentId et agentAction requis' }, { status: 400 });
        }
        const result = await autonomousAgent.executeAction(agentId, body.agentAction);
        return NextResponse.json({ result });
      }

      case 'list': {
        if (!userId) return NextResponse.json({ error: 'userId requis' }, { status: 400 });
        const agents = autonomousAgent.list(userId).map(a => ({
          id: a.id, name: a.name, status: a.status,
          createdAt: a.createdAt, actionsCount: a.memory.actionHistory.length,
        }));
        return NextResponse.json({ agents });
      }

      case 'delete': {
        if (!agentId) return NextResponse.json({ error: 'agentId requis' }, { status: 400 });
        const deleted = autonomousAgent.delete(agentId);
        return NextResponse.json({ deleted });
      }

      case 'stats': {
        const stats = autonomousAgent.getAgentStats();
        return NextResponse.json({ stats });
      }

      default:
        return NextResponse.json({ error: 'Action non reconnue: ' + action }, { status: 400 });
    }
  } catch (error: unknown) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Erreur serveur',
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    name: 'Autonomous Agents API',
    description: 'Cree et execute des agents de code autonomes',
    endpoints: {
      create: 'POST /api/code/agents - action: "create" + userId + name',
      execute: 'POST /api/code/agents - action: "execute" + agentId + agentAction',
      list: 'POST /api/code/agents - action: "list" + userId',
      delete: 'POST /api/code/agents - action: "delete" + agentId',
    },
    agentActions: [
      'execute_code', 'call_api', 'generate_code', 'think',
      'search', 'read', 'wait', 'navigate', 'deploy',
    ],
  });
}