// POST /api/code/deploy - Deploiement one-click du code en API live
import { NextRequest, NextResponse } from 'next/server';
import { deployCode, executeDeployment, listDeployments, deleteDeployment } from '@/lib/code-engine/deployer';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, name, type, userId, description } = body;

    if (!code || !name || !type || !userId) {
      return NextResponse.json({ error: 'code, name, type et userId requis' }, { status: 400 });
    }

    if (!['api', 'function', 'webhook', 'cron'].includes(type)) {
      return NextResponse.json({ error: 'Type invalide. Types supportes: api, function, webhook, cron' }, { status: 400 });
    }

    const result = await deployCode({ code, name, type, userId, description });

    return NextResponse.json({
      success: result.success,
      url: result.url,
      method: result.method,
      type: result.type,
      deployedAt: result.deployedAt,
      expiresAt: result.expiresAt,
    }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur lors du deploiement',
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const deployId = searchParams.get('deployId');

  if (userId) {
    const deploys = listDeployments(userId);
    return NextResponse.json({ deployments: deploys });
  }

  return NextResponse.json({
    message: 'API de deploiement CodeEngine',
    usage: 'POST /api/code/deploy avec { code, name, type, userId }',
    types: ['api - REST endpoint', 'function - Serverless function', 'webhook - Webhook receiver', 'cron - Scheduled task'],
  });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const deployId = searchParams.get('deployId');
  
  if (!deployId) {
    return NextResponse.json({ error: 'deployId requis' }, { status: 400 });
  }

  const deleted = deleteDeployment(deployId);
  if (!deleted) {
    return NextResponse.json({ error: 'Deploiement introuvable' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
