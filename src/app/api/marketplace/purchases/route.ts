export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { getPurchaseHistory } from '@/lib/marketplace/purchase-system';

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const result = await getPurchaseHistory(auth.userId, { page, limit });

    return secureResponse(NextResponse.json(result), request);
  } catch (err: any) {
    return secureResponse(NextResponse.json({ error: err.message }, { status: 500 }), request);
  }
}
