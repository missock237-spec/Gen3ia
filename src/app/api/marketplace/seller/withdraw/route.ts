/**
 * Stripe Instant Withdrawal — Retrait instantané des gains vendeur
 * Via Stripe Connect Instant Payouts (arrivée sous 30 secondes sur la carte)
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { requestInstantPayout } from '@/lib/marketplace/seller-earnings';

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
    const result = await requestInstantPayout(auth.userId);

    const statusCode = result.success ? 200 : 400;

    return secureResponse(
      NextResponse.json({
        success: result.success,
        message: result.message,
        amount: result.amount,
        payoutId: result.payoutId,
      }, { status: statusCode }),
      request
    );
  } catch (err) {
    return secureResponse(
      NextResponse.json(
        { error: 'Erreur retrait', details: err instanceof Error ? err.message : 'Erreur' },
        { status: 500 }
      ),
      request
    );
  }
}
