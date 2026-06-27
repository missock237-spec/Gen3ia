import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { createOnboardingLink, syncSellerAccount } from '@/lib/marketplace/stripe-service';

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const returnUrl = searchParams.get('returnUrl') || `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/marketplace/seller`;

    // Sync account status if requested or as a safety measure
    await syncSellerAccount(auth.userId);

    const onboardingUrl = await createOnboardingLink(auth.userId, returnUrl);

    return secureResponse(NextResponse.json({ url: onboardingUrl }), request);
  } catch (err: any) {
    return secureResponse(NextResponse.json({ error: err.message }, { status: 500 }), request);
  }
}
