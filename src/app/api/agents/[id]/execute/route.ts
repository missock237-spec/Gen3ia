// POST /api/agents/[id]/execute — Lance l'execution d'un agent
// SECURITE: withAuth() + correction IDOR (userId/agentId du token et params, pas du body) + quota
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, type RouteParams } from '@/lib/with-auth';





export const dynamic = "force-dynamic";
export const POST = withAuth(async (request: NextRequest, ctx: { params?: RouteParams }, auth) => {
  try {
    const params = ctx.params ? await ctx.params : {};
    const routeAgentId = typeof params['id'] === 'string' ? params['id'] : undefined;
    const body = await request.json();
    const { agentId: bodyAgentId, task } = body;

    // SECURITY: l'agentId vient des params de route (ou echoue). JAMAIS du body.
    const agentId = routeAgentId || bodyAgentId;
    if (!agentId || !task) return NextResponse.json({ error: 'agentId et task requis' }, { status: 400 });

    // SECURITY: verifier que l'agent appartient a l'utilisateur authentifie (ownership)
    const agent = await db.agent.findFirst({
      where: { id: agentId, userId: auth.userId },
      select: { id: true },
    });
    if (!agent) return NextResponse.json({ error: 'Agent non trouve' }, { status: 404 });

    const execution = await db.agentExecution.create({
      data: {
        agentId,
        userId: auth.userId, // userId du token, jamais du body
        task,
        status: 'running',
        steps: '[]',
        currentStep: 0,
        totalSteps: 1,
      },
    });
    return NextResponse.json({ executionId: execution.id, status: 'running' });
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}, {
  requireAuth: true,
  roles: ['user'],
  rateLimit: { limit: 10, windowMs: 60000 },
  quota: true, // l'execution d'agent consomme du LLM
});
