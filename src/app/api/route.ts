import { NextResponse } from 'next/server';
export async function GET() {
  return NextResponse.json({
    name: 'Genova AI API',
    version: '0.8.0',
    status: 'operational',
    endpoints: ['/api/auth/login','/api/auth/register','/api/agents','/api/dashboard','/api/analytics','/api/billing','/api/activities','/api/integrations','/api/connectors','/api/conversations','/api/workflows','/api/tasks','/api/memory','/api/knowledge','/api/rag','/api/marketplace','/api/scheduler','/api/monitoring','/api/queue','/api/resources','/api/services','/api/system','/api/admin','/api/social','/api/voice','/api/multimodal','/api/browser','/api/images','/api/videos','/api/ai','/api/ai-server','/api/multi-agent','/api/observability','/api/pocketbase','/api/n8n','/api/whatsapp','/api/fluro','/api/auth','/api/approvals','/api/avatars','/api/guardrails','/api/workspaces','/api/health','/api/events','/api/keys','/api/upload','/api/search','/api/relay','/api/playground','/api/terminal','/api/export','/api/feedback','/api/docs','/api/webhooks','/api/audio','/api/payments'],
  });
}