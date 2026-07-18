// POST /api/code/gateway - Point d'entree securise pour les agents de code
// Les agents recoivent un token de session, jamais les credentials
import { NextRequest, NextResponse } from 'next/server';
import { callApi, validateAgentSession, createAgentSession, GatewayRequest } from '@/lib/code-engine/api-gateway';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const sessionToken = authHeader.replace('Bearer ', '').trim();

    if (!sessionToken || !sessionToken.startsWith('gva_sess_')) {
      return NextResponse.json({ error: 'Token de session requis' }, { status: 401 });
    }

    // Valider le token de session (il est temporaire et scope)
    const session = validateAgentSession(sessionToken);
    if (!session.valid || !session.agentId || !session.userId) {
      return NextResponse.json({ error: session.error || 'Session invalide' }, { status: 401 });
    }

    const body = await request.json();
    const { provider, endpoint, method, headers, body: requestBody, params } = body;

    if (!provider || !endpoint || !method) {
      return NextResponse.json({ error: 'provider, endpoint et method requis' }, { status: 400 });
    }

    const gatewayReq: GatewayRequest = {
      provider,
      endpoint,
      method: method.toUpperCase(),
      headers: headers || {},
      body: requestBody,
      params: params || {},
    };

    const result = await callApi(session.agentId, session.userId, gatewayReq);

    return NextResponse.json({
      success: result.success,
      data: result.data,
      duration: result.duration + 'ms',
      masked: result.masked.length > 0 ? result.masked : undefined,
    }, { status: result.status });
  } catch (error: unknown) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur serveur',
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    name: 'API Gateway - Code Agents',
    description: 'Proxy securise pour les agents de code',
    auth: 'Bearer gva_sess_{token}',
    providers: ['github', 'stripe', 'slack', 'discord', 'supabase', 'resend', 'openai', 'groq', 'openrouter'],
    docs: '/api/code/gateway/docs',
  });
}