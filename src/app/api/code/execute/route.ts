// POST /api/code/execute - Executer du code dans le sandbox
import { NextRequest, NextResponse } from 'next/server';
import { executeCode, checkExecutionQuota, ExecutionRequest } from '@/lib/code-engine/sandbox';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, language, timeout, context, userId } = body;

    if (!code) {
      return NextResponse.json({ error: 'Code requis' }, { status: 400 });
    }

    // Verifier quota si userId fourni
    if (userId) {
      const quota = checkExecutionQuota(userId);
      if (!quota.ok) {
        return NextResponse.json({
          error: 'Quota d\'execution atteint. Limite: 10 executions/minute',
          remaining: 0,
        }, { status: 429 });
      }
    }

    const req: ExecutionRequest = {
      code,
      language: language || 'javascript',
      timeout: Math.min(timeout || 10000, 30000),
      context: context || {},
    };

    const result = await executeCode(req);

    return NextResponse.json({
      success: result.success,
      output: result.output,
      error: result.error || null,
      duration: result.duration,
      tokens: result.tokens || 0,
      remaining: userId ? checkExecutionQuota(userId).remaining : undefined,
    });
  } catch (error: unknown) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur serveur',
      output: [],
      duration: 0,
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    name: 'Code Engine API',
    version: '1.0.0',
    description: 'Sandbox d\'execution de code securise',
    endpoints: {
      execute: 'POST /api/code/execute',
      sessions: 'POST /api/code/sessions',
    },
    languages: ['javascript', 'typescript', 'html'],
    maxTimeout: 30000,
    maxCodeLength: 50000,
    rateLimit: '10 requetes/minute par utilisateur',
  });
}