// ============================================================
// GET  /api/onboarding — État d'onboarding
// POST /api/onboarding — Compléter une étape
// PATCH /api/onboarding — Sauter une étape
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  getOnboardingState,
  getOnboardingProgress,
  completeStep,
  skipStep,
  type OnboardingStep,
} from '@/lib/onboarding';
import { withRateLimit, RATE_LIMIT_PRESETS } from '@/lib/api-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function extractUserId(req: NextRequest): string | null {
  const cookie = req.cookies.get('gen3ia_session')?.value;
  if (!cookie) return null;
  try {
    return JSON.parse(Buffer.from(cookie, 'base64url').toString()).uid;
  } catch {
    return null;
  }
}

async function getHandler(req: NextRequest): Promise<NextResponse> {
  const userId = extractUserId(req);
  if (!userId) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const state = await getOnboardingState(userId);
  const progress = getOnboardingProgress(state);

  return NextResponse.json({ ...state, progress });
}

async function postHandler(req: NextRequest): Promise<NextResponse> {
  const userId = extractUserId(req);
  if (!userId) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.step) {
    return NextResponse.json({ error: 'Étape requise' }, { status: 400 });
  }

  const result = await completeStep(userId, body.step as OnboardingStep);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });

  return NextResponse.json({ success: true, nextStep: result.nextStep });
}

async function patchHandler(req: NextRequest): Promise<NextResponse> {
  const userId = extractUserId(req);
  if (!userId) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.step) {
    return NextResponse.json({ error: 'Étape requise' }, { status: 400 });
  }

  const result = await skipStep(userId, body.step as OnboardingStep);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });

  return NextResponse.json({ success: true, nextStep: result.nextStep });
}

export const GET = withRateLimit(getHandler, RATE_LIMIT_PRESETS.default);
export const POST = withRateLimit(postHandler, RATE_LIMIT_PRESETS.default);
export const PATCH = withRateLimit(patchHandler, RATE_LIMIT_PRESETS.default);
