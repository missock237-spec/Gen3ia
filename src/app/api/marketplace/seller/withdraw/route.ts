/**
 * Stripe Withdrawal — Retrait des gains vendeur via Stripe Connect uniquement
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { requestStripeWithdrawal } from '@/lib/marketplace/seller-earnings';

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  return response;
}

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 3, windowMs: 60000 },
  });

  if (error) return error;
  if (!auth) return secureResponse(NextResponse.json({ error: 'Non authentifié' }, { status: 401 }), request);

  try {
    const result = await requestStripeWithdrawal(auth.userId);

    if (!result.success) {
      return secureResponse(
        NextResponse.json({ success: false, message: result.message }, { status: 400 }),
        request
      );
    }

    return secureResponse(
      NextResponse.json({ success: true, message: result.message }),
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
