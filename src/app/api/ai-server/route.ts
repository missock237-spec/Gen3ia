// AI Server — Point d'entree unique pour les services IA
// GET: health, status
// POST: analyze, process, diagnose
// SECURITE: withAuth() + quota + rateLimit Redis

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { withAuth, type RouteParams } from '@/lib/with-auth';
import { createAIRouter } from '@/lib/ai-router';
import { db } from '@/lib/db';





export const dynamic = "force-dynamic";
const log = createLogger('ai-server');

// GET /api/ai-server?action=health|status
const getHandler = withAuth(async (request: NextRequest, ctx: { params?: RouteParams }, auth) => {
  const action = request.nextUrl.searchParams.get('action') || 'health';

  switch (action) {
    case 'health':
      return NextResponse.json({
        status: 'ok',
        version: '1.0.0',
        services: ['analyze', 'process', 'diagnose', 'chat'],
        timestamp: new Date().toISOString(),
      });

    case 'status': {
      const [agentCount, executionCount, userCredits] = await Promise.all([
        db.agent.count({ where: { userId: auth.userId } }),
        db.agentExecution.count({ where: { userId: auth.userId, createdAt: { gte: new Date(Date.now() - 86400000) } } }),
        db.credit.findFirst({ where: { userId: auth.userId }, select: { balance: true } }),
      ]);
      return NextResponse.json({
        agents: agentCount,
        executionsToday: executionCount,
        credits: userCredits?.balance || 0,
        uptime: process.uptime(),
      });
    }

    default:
      return NextResponse.json({ error: 'Action non reconnue. Utilisez health ou status' }, { status: 400 });
  }
}, {
  requireAuth: true,
  rateLimit: { limit: 100, windowMs: 60000 },
});

// POST /api/ai-server — Action LLM (analyze/process/diagnose) : couteuse en tokens → QUOTA obligatoire
const postHandler = withAuth(async (request: NextRequest, ctx: { params?: RouteParams }, auth) => {
  const action = request.nextUrl.searchParams.get('action');
  let resolvedAction: string;
  let input: unknown;
  let model: string | undefined;

  const body = await request.json().catch(() => ({}));
  resolvedAction = action || (body as { action?: string }).action as string;
  input = body.input;
  model = body.model;

  if (!resolvedAction) return NextResponse.json({ error: 'Action requise (analyze, process, diagnose)' }, { status: 400 });
  if (!input) return NextResponse.json({ error: 'Input requis' }, { status: 400 });

  const router = createAIRouter(auth.userId);
  let systemPrompt: string;

  switch (resolvedAction) {
    case 'analyze':
      systemPrompt = 'Tu es un analyste IA. Analyse les donnees fournies et donne des insights clairs et concis en francais.';
      break;
    case 'process':
      systemPrompt = 'Tu es un processeur IA. Traite les donnees selon les instructions et retourne un resultat structure en francais.';
      break;
    case 'diagnose':
      systemPrompt = 'Tu es un diagnostiqueur IA. Analyse les logs/erreurs fournis et identifie les causes racines en francais.';
      break;
    default:
      return NextResponse.json({ error: 'Action invalide. Utilisez analyze, process ou diagnose' }, { status: 400 });
  }

  const response = await router.chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: String(input).slice(0, 10000) },
  ], { model: model || 'default' });

  log.info('ai_server_action', { userId: auth.userId, action: resolvedAction, tokens: response.usage?.totalTokens });

  return NextResponse.json({
    success: true,
    result: response.content,
    model: response.model,
    usage: response.usage,
  });
}, {
  requireAuth: true,
  roles: ['user'],
  rateLimit: { limit: 20, windowMs: 60000 },
  quota: true,
});

export { getHandler as GET, postHandler as POST };
