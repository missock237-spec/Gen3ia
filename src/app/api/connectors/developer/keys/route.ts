import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { createDeveloperKey, listDeveloperKeys, revokeDeveloperKey } from '@/lib/connectors/developer-service';

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const keys = await listDeveloperKeys(auth.userId);
    return secureResponse(NextResponse.json({ success: true, data: keys }), request);
  } catch (err: any) {
    return secureResponse(NextResponse.json({ error: err.message }, { status: 500 }), request);
  }
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const { name, scopes, expiresInDays } = await request.json();

    if (!name) {
      return secureResponse(NextResponse.json({ error: 'Name is required' }, { status: 400 }), request);
    }

    const key = await createDeveloperKey({
      name,
      userId: auth.userId,
      scopes,
      expiresInDays
    });

    return secureResponse(NextResponse.json({ success: true, data: key }), request);
  } catch (err: any) {
    return secureResponse(NextResponse.json({ error: err.message }, { status: 500 }), request);
  }
}
