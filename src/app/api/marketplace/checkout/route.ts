import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { createMarketplaceCheckoutSession } from '@/lib/marketplace/stripe-service';

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { listingId, successUrl, cancelUrl } = await request.json();

    if (!listingId) {
      return secureResponse(NextResponse.json({ error: 'listingId is required' }, { status: 400 }), request);
    }

    const session = await createMarketplaceCheckoutSession({
      userId: auth.userId,
      listingId,
      successUrl: successUrl || `${process.env.NEXT_PUBLIC_APP_URL}/marketplace/purchase/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: cancelUrl || `${process.env.NEXT_PUBLIC_APP_URL}/marketplace/listing/${listingId}`,
    });

    return secureResponse(NextResponse.json({ url: session.url, sessionId: session.id }), request);
  } catch (err: any) {
    return secureResponse(NextResponse.json({ error: err.message }, { status: 500 }), request);
  }
}
