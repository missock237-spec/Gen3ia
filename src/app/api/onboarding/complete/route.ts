// ============================================================
// POST /api/onboarding/complete — Marquer l'onboarding terminé
// ============================================================
//  Crédite +5 crédits de bienvenue et crée une transaction.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getOnboardingState, completeStep } from '@/lib/onboarding';
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

async function handler(req: NextRequest): Promise<NextResponse> {
  const userId = extractUserId(req);
  if (!userId) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  // Marquer la dernière étape comme terminée (ce qui déclenche le bonus)
  const result = await completeStep(userId, 'set_guardrails');
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });

  const state = await getOnboardingState(userId);

  return NextResponse.json({
    success: true,
    completed: state.onboardingCompleted,
    bonusCredits: 5,
    message: 'Onboarding terminé ! Vous avez reçu 5 crédits de bienvenue. 🎉',
  });
}

export const POST = withRateLimit(handler, { max: 1, windowSec: 3600, key: 'onboarding-complete' });
