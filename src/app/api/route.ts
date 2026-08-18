import { NextResponse } from 'next/server';

export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({
    name: 'Gen3ia API',
    version: '0.10.0',
    status: 'operational',
    endpoints: [
      '/api/auth','/api/agents','/api/dashboard','/api/analytics','/api/billing',
      '/api/activities','/api/integrations','/api/connectors','/api/conversations',
      '/api/workflows','/api/tasks','/api/memory','/api/knowledge','/api/rag',
      '/api/marketplace','/api/scheduler','/api/monitoring','/api/queue',
      '/api/resources','/api/services','/api/system','/api/admin','/api/social',
      '/api/voice','/api/multimodal','/api/browser','/api/images','/api/videos',
      '/api/ai','/api/ai-server','/api/multi-agent','/api/observability',
      '/api/fluro','/api/approvals','/api/avatars','/api/guardrails',
      '/api/workspaces','/api/health','/api/events','/api/keys','/api/upload',
      '/api/search','/api/relay','/api/terminal','/api/export',
      '/api/feedback','/api/docs','/api/webhooks','/api/audio','/api/payments',
      '/api/ads','/api/affiliate','/api/advertising','/api/skills',
    ],
  });
}
