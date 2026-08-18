// API Route — LLM Router snapshot (admin observability)
// GET  /api/admin/llm-router         → returns the current circuit-breaker state for all providers
// POST /api/admin/llm-router         → { action: 'reset' | 'reset_provider', provider?: 'groq' | ... }

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity } from '@/lib/security';
import { getRouterSnapshot, resetAllProviders, resetProvider } from '@/lib/llm/gateway';
import type { LLMProvider } from '@/lib/llm/provider';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  if (auth.role !== 'admin') {
    return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 });
  }

  return NextResponse.json({
    router: getRouterSnapshot(),
  });
}

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, { requireAuth: true });
  if (error || !auth) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  if (auth.role !== 'admin') {
    return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 });
  }

  let body: { action?: string; provider?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
  }

  if (body.action === 'reset_all') {
    resetAllProviders();
    return NextResponse.json({ ok: true, message: 'Tous les circuits ont été réinitialisés', router: getRouterSnapshot() });
  }
  if (body.action === 'reset_provider' && body.provider) {
    const provider = body.provider as LLMProvider;
    resetProvider(provider);
    return NextResponse.json({ ok: true, message: `Circuit ${provider} réinitialisé`, router: getRouterSnapshot() });
  }
  return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
}
