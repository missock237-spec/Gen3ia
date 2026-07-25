// ============================================================
// Voice Agent API — Créer, gérer et exécuter des appels
// via les agents IA vocaux
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getVoiceAgentEngine } from '@/lib/voice/voice-agent';
import { getAuthenticatedUser } from '@/lib/session';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action') || 'list';

  try {
    switch (action) {
      case 'list': {
        const agents = await db.voiceCall.findMany({
          where: { userId: user.userId },
          orderBy: { createdAt: 'desc' },
          take: 50,
        });
        return NextResponse.json({ agents });
      }

      case 'history': {
        const calls = await db.voiceCall.findMany({
          where: { userId: user.userId },
          orderBy: { createdAt: 'desc' },
          take: 20,
        });
        return NextResponse.json({ calls });
      }

      case 'active': {
        const engine = getVoiceAgentEngine();
        const activeCalls = engine.getActiveCallsByUser(user.userId);
        return NextResponse.json({ activeCalls });
      }

      case 'agents': {
        const voiceAgents = await db.agent.findMany({
          where: { userId: user.userId, type: 'voice' },
          orderBy: { createdAt: 'desc' },
        });
        return NextResponse.json({ agents: voiceAgents });
      }

      case 'stats': {
        const total = await db.voiceCall.count({ where: { userId: user.userId } });
        const completed = await db.voiceCall.count({ where: { userId: user.userId, status: 'completed' } });
        const totalDuration = await db.voiceCall.aggregate({
          where: { userId: user.userId },
          _sum: { durationSeconds: true },
        });
        return NextResponse.json({
          totalCalls: total,
          completedCalls: completed,
          totalDurationSeconds: totalDuration._sum.durationSeconds || 0,
        });
      }

      default:
        return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur interne';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, ...params } = body;

    const engine = getVoiceAgentEngine();

    switch (action) {
      case 'create-agent': {
        const { name, config } = params;
        if (!name) {
          return NextResponse.json({ error: 'Nom requis' }, { status: 400 });
        }
        const result = await engine.createVoiceAgent(user.userId, name, config || {});
        return NextResponse.json(result);
      }

      case 'make-call': {
        const { agentId, toNumber, fromNumber, context } = params;
        if (!agentId || !toNumber || !fromNumber) {
          return NextResponse.json({ error: 'agentId, toNumber et fromNumber requis' }, { status: 400 });
        }
        const result = await engine.makeCall(user.userId, agentId, toNumber, fromNumber, context);
        return NextResponse.json(result);
      }

      case 'end-call': {
        const { callSid } = params;
        if (!callSid) {
          return NextResponse.json({ error: 'callSid requis' }, { status: 400 });
        }
        await engine.endCall(callSid);
        return NextResponse.json({ success: true });
      }

      case 'delete-agent': {
        const { agentId } = params;
        if (!agentId) {
          return NextResponse.json({ error: 'agentId requis' }, { status: 400 });
        }
        await db.agent.delete({ where: { id: agentId, userId: user.userId } });
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur interne';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
