import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { executeServiceAction, getAvailableActions } from '@/lib/agent-engine/service-executor';

export const dynamic = "force-dynamic";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session?.user.id) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const { agentId } = await params;
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent || agent.userId !== session.user.id) {
      return NextResponse.json({ error: 'Agent non trouve ou acces refuse' }, { status: 404 });
    }

    const body = await request.json();
    const { service, action, params: actionParams } = body;

    if (!service || !action) {
      return NextResponse.json({ error: 'Champs requis: service, action' }, { status: 400 });
    }

    const availableActions = getAvailableActions(service);
    if (availableActions.length === 0) {
      return NextResponse.json({ error: `Service "${service}" non supporte` }, { status: 400 });
    }

    const actionExists = availableActions.find(a => a.name === action);
    if (!actionExists) {
      return NextResponse.json({
        error: `Action "${action}" non disponible pour ${service}`,
        availableActions: availableActions.map(a => a.name),
      }, { status: 400 });
    }

    const auth = await prisma.workflowAuthorization.findFirst({
      where: { userId: session.user.id, service, isActive: true },
    });

    if (!auth) {
      return NextResponse.json({
        error: `Compte ${service} non connecte. Utilise /authorizations pour connecter.`,
        requiresAuth: true,
        service,
      }, { status: 401 });
    }

    const result = await executeServiceAction({
      service,
      action,
      params: actionParams || {},
      userId: session.user.id,
      agentId,
    });

    await prisma.agentActionLog.create({
      data: {
        agentId,
        action: `${service}:${action}`,
        details: JSON.stringify({ params: actionParams }),
        status: result.success ? 'completed' : 'failed',
        result: JSON.stringify(result),
        userId: session.user.id,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Agent execute-service error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const session = await getServerSession();
    if (!session?.user.id) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const { agentId } = await params;
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent || agent.userId !== session.user.id) {
      return NextResponse.json({ error: 'Agent non trouve' }, { status: 404 });
    }

    const url = new URL(request.url);
    const service = url.searchParams.get('service');

    if (service) {
      return NextResponse.json({
        service,
        availableActions: getAvailableActions(service),
        isConnected: !!(await prisma.workflowAuthorization.findFirst({
          where: { userId: session.user.id, service, isActive: true },
        })),
      });
    }

    const authorizations = await prisma.workflowAuthorization.findMany({
      where: { userId: session.user.id, isActive: true },
      select: { service: true, accountName: true, scopes: true, lastUsedAt: true },
    });

    return NextResponse.json({
      connectedServices: authorizations,
      totalConnected: authorizations.length,
    });
  } catch (error) {
    console.error('Agent execute-service GET error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
