import { NextResponse } from 'next/server';
import { orchestrator } from '@/lib/code-engine/orchestrator-core';
import { gatewayStats } from '@/lib/code-engine/api-gateway';
import { autonomousAgent } from '@/lib/code-engine/web-agent-core';

export async function GET() {
  const agentStats = autonomousAgent.getAgentStats();
  const gwStats = gatewayStats();
  const orchStats = orchestrator.getStats();

  return NextResponse.json({
    name: 'Genova AI Platform',
    version: '3.0.0',
    status: 'operational',
    modules: {
      codeEngine: {
        version: '3.0.0',
        features: ['sandbox', 'realtime', 'generator', 'deployer', 'agents', 'orchestrator', 'gateway'],
        status: 'active',
      },
      agents: agentStats,
      gateway: gwStats,
      orchestrator: orchStats,
    },
    api: {
      total: 23,
      endpoints: {
        agent: ['/api/agent/connect', '/api/agent/disconnect', '/api/agent/instruct', '/api/agent/approve', '/api/agent/oauth'],
        code: [
          '/api/code/execute', '/api/code/sessions', '/api/code/gateway',
          '/api/code/generate', '/api/code/deploy', '/api/code/agents',
          '/api/code/orchestrate'
        ],
        payments: ['/api/mobile-money/*'],
        integrations: ['/api/integrations/*'],
        system: ['/api/status', '/api/dashboard', '/api/docs', '/api/sso/*'],
      },
    },
  });
}