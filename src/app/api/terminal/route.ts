/**
 * Terminal API — POST: Exécute du code, GET: Langages supportés
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { executeCode, isCodeSafe, isLanguageSupported, SUPPORTED_LANGUAGES } from '@/lib/terminal/sandbox';

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

/**
 * GET /api/terminal
 * Retourne les langages supportés par le terminal
 */
export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 60, windowMs: 60000 },
  });

  if (error) return error;
  if (!auth) return secureResponse(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), request);

  return secureResponse(
    NextResponse.json({
      languages: SUPPORTED_LANGUAGES,
      sandbox: {
        maxCodeLength: 50000,
        defaultTimeoutMs: 10000,
        blockedPatterns: [
          'require()', 'import from', 'process.',
          'child_process', 'fs.', 'net.', 'vm.',
          'eval()', 'Function()',
        ],
      },
    }),
    request
  );
}

/**
 * POST /api/terminal
 * Exécute du code dans le sandbox
 * Body: { language, code, timeoutMs?, agentId? }
 */
export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 30, windowMs: 60000 },
  });

  if (error) return error;
  if (!auth) return secureResponse(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), request);

  try {
    const body = await request.json();
    const { language, code, timeoutMs, agentId } = body;

    if (!language) {
      return secureResponse(
        NextResponse.json({ error: 'Le champ "language" est requis' }, { status: 400 }),
        request
      );
    }

    if (!code || typeof code !== 'string') {
      return secureResponse(
        NextResponse.json({ error: 'Le champ "code" est requis' }, { status: 400 }),
        request
      );
    }

    if (!isLanguageSupported(language)) {
      return secureResponse(
        NextResponse.json({
          error: `Langage non supporté: ${language}`,
          supported: SUPPORTED_LANGUAGES,
        }, { status: 400 }),
        request
      );
    }

    // Vérification de sécurité
    const safetyCheck = isCodeSafe(code);
    if (!safetyCheck.safe) {
      return secureResponse(
        NextResponse.json({ error: `Code refusé: ${safetyCheck.reason}` }, { status: 403 }),
        request
      );
    }

    // Vérification des crédits (chaque exécution coûte 1 crédit)
    const { checkCredits, deductCredits } = await import('@/lib/billing/credits');
    const creditCheck = await checkCredits(auth.userId, 1, 'code_execution');

    if (!creditCheck.allowed) {
      return secureResponse(
        NextResponse.json({
          error: 'Crédits insuffisants. Chaque exécution de code coûte 1 crédit.'
        }, { status: 402 }),
        request
      );
    }

    const result = await executeCode({
      userId: auth.userId,
      agentId: agentId || undefined,
      language,
      code,
      timeoutMs: timeoutMs ? Math.min(timeoutMs, 30000) : 10000,
    });

    // Déduire 1 crédit
    await deductCredits({
      userId: auth.userId,
      amount: 1,
      type: 'usage',
      resourceType: 'code_execution',
      description: `Exécution ${language} dans le terminal`,
      metadata: { sessionId: result.id, language },
    });

    return secureResponse(
      NextResponse.json({
        success: result.status === 'completed',
        session: {
          id: result.id,
          language: result.language,
          output: result.output,
          error: result.error,
          exitCode: result.exitCode,
          status: result.status,
          executionTimeMs: result.executionTimeMs,
          startedAt: result.startedAt,
          completedAt: result.completedAt,
        },
        creditsUsed: 1,
        creditsRemaining: creditCheck.remaining,
      }),
      request
    );
  } catch (err) {
    return secureResponse(
      NextResponse.json(
        { error: 'Échec de l\'exécution', details: err instanceof Error ? err.message : 'Erreur inconnue' },
        { status: 500 }
      ),
      request
    );
  }
}
