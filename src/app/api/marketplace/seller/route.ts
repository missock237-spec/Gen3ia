/**
 * Seller API — Profil vendeur, ventes, retraits
 *
 * GET  /api/marketplace/seller → Profil et stats du vendeur
 * POST /api/marketplace/seller/withdraw → Demander un retrait
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import {
  getSellerProfile,
  getSellerSalesHistory,
  requestWithdrawal,
} from '@/lib/marketplace/seller-earnings';

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

/**
 * GET /api/marketplace/seller
 * Retourne le profil vendeur et l'historique des ventes
 */
export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 30, windowMs: 60000 },
  });

  if (error) return error;
  if (!auth) return secureResponse(NextResponse.json({ error: 'Non authentifié' }, { status: 401 }), request);

  try {
    const { searchParams } = new URL(request.url);
    const includeSales = searchParams.get('sales') === 'true';
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const [profile, sales] = await Promise.all([
      getSellerProfile(auth.userId),
      includeSales ? getSellerSalesHistory(auth.userId, limit) : Promise.resolve([]),
    ]);

    return secureResponse(
      NextResponse.json({
        profile,
        sales,
        commission: {
          platformRate: 30,
          sellerRate: 70,
          explanation: '30% de commission Genova, 70% reversé au vendeur',
        },
      }),
      request
    );
  } catch (err) {
    return secureResponse(
      NextResponse.json(
        { error: 'Erreur profil vendeur', details: err instanceof Error ? err.message : 'Erreur inconnue' },
        { status: 500 }
      ),
      request
    );
  }
}

/**
 * POST /api/marketplace/seller
 * Demander un retrait des gains
 * Body: { method: 'stripe' | 'paypal' | 'credits', destinationEmail?: string }
 */
export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 5, windowMs: 60000 }, // 5 requêtes/minute max
  });

  if (error) return error;
  if (!auth) return secureResponse(NextResponse.json({ error: 'Non authentifié' }, { status: 401 }), request);

  try {
    const body = await request.json();
    const { method, destinationEmail } = body;

    if (!method || !['stripe', 'paypal', 'credits'].includes(method)) {
      return secureResponse(
        NextResponse.json({
          error: 'Méthode de retrait invalide. Options: stripe, paypal, credits',
          available: ['stripe', 'paypal', 'credits'],
        }, { status: 400 }),
        request
      );
    }

    const result = await requestWithdrawal(auth.userId, method, destinationEmail);

    if (!result.success) {
      return secureResponse(
        NextResponse.json({ error: result.message }, { status: 400 }),
        request
      );
    }

    return secureResponse(
      NextResponse.json({
        success: true,
        message: result.message,
        withdrawalId: result.withdrawalId,
      }),
      request
    );
  } catch (err) {
    return secureResponse(
      NextResponse.json(
        { error: 'Erreur retrait', details: err instanceof Error ? err.message : 'Erreur inconnue' },
        { status: 500 }
      ),
      request
    );
  }
}
