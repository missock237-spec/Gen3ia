// ============================================================
// POST /api/ai/chat — Chat avec l'assistant IA
// SECURITE: withAuth() + quota LLM + rate limiting Redis
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createAIRouter } from '@/lib/ai-router';
import { createLogger } from '@/lib/logger';
import { withAuth } from '@/lib/with-auth';

const log = createLogger('ai-chat');

const MAX_HISTORY_LENGTH = 50;
const MAX_MESSAGE_LENGTH = 5000;
const MAX_TOTAL_HISTORY_SIZE = 20000;

export const POST = withAuth(async (request: NextRequest, ctx: { params?: Promise<any> }, auth) => {
  try {
    const body = await request.json();
    const { message, history } = body;

    if (!message) {
      return NextResponse.json({ error: 'Message requis' }, { status: 400 });
    }

    if (typeof message !== 'string' || message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json({
        error: `Message trop long (max ${MAX_MESSAGE_LENGTH} caracteres)`,
      }, { status: 400 });
    }

    // Valider l'historique
    const validatedHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    if (history !== undefined && history !== null) {
      if (!Array.isArray(history)) {
        return NextResponse.json({ error: 'History doit etre un tableau' }, { status: 400 });
      }

      if (history.length > MAX_HISTORY_LENGTH) {
        return NextResponse.json({
          error: `History trop longue (max ${MAX_HISTORY_LENGTH} messages)`,
        }, { status: 400 });
      }

      let totalSize = 0;

      for (const m of history) {
        if (!m || typeof m.role !== 'string' || typeof m.content !== 'string') {
          return NextResponse.json({ error: 'Format de message invalide dans history' }, { status: 400 });
        }

        if (!['user', 'assistant'].includes(m.role)) {
          return NextResponse.json({
            error: 'Role invalide dans history (user ou assistant uniquement)',
          }, { status: 400 });
        }

        const content = String(m.content).slice(0, MAX_MESSAGE_LENGTH);
        totalSize += content.length;

        if (totalSize > MAX_TOTAL_HISTORY_SIZE) {
          return NextResponse.json({ error: 'History trop volumineuse' }, { status: 400 });
        }

        validatedHistory.push({ role: m.role as 'user' | 'assistant', content });
      }
    }

    const router = createAIRouter(auth.userId);

    const messages = [
      {
        role: 'system' as const,
        content: `Tu es Gen3ia, un assistant IA qui aide les utilisateurs a controler leur systeme d'agents IA. Tu parles en francais. Tu es concis et professionnel.`,
      },
      ...validatedHistory.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: message },
    ];

    const response = await router.chat(messages, { model: 'default' });

    log.info('ai_chat_success', {
      userId: auth.userId,
      model: response.model,
      provider: response.provider,
      tokens: response.usage?.total_tokens,
      costUsd: response.costUsd,
    });

    return NextResponse.json({
      reply: response.content,
      usage: response.usage,
      provider: response.provider,
      model: response.model,
      costUsd: response.costUsd,
    });

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.error('AI chat failed', { error: errMsg });
    return NextResponse.json({
      error: 'Erreur lors de la communication avec l\'IA',
      details: process.env.NODE_ENV === 'development' ? errMsg : undefined,
    }, { status: 500 });
  }
}, {
  requireAuth: true,
  roles: ['user'],
  rateLimit: { limit: 20, windowMs: 60000 },
  quota: true, // Le chat consomme des tokens LLM → vérifier quota
});
