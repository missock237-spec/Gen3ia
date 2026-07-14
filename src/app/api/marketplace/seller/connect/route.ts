/**
 * Stripe Connect — Lien d'onboarding pour les vendeurs
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { getOrCreateStripeConnectAccount } from '@/lib/marketplace/seller-earnings';

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  return response;
}

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 5, windowMs: 60000 },
  });

  if (error) return error;
  if (!auth) return secureResponse(NextResponse.json({ error: 'Non authentifié' }, { status: 401 }), request);

  try {
    const result = await getOrCreateStripeConnectAccount(auth.userId);

    return secureResponse(
      NextResponse.json({
        url: result.onboardingLink,
        accountId: result.accountId,
        isOnboarded: result.isOnboarded,
      }),
      request
    );
  } catch (err) {
    return secureResponse(
      NextResponse.json(
        { error: 'Erreur connexion Stripe', details: err instanceof Error ? err.message : 'Erreur' },
        { status: 500 }
      ),
      request
    );
  }
}
