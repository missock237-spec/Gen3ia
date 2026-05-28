<<<<<<< HEAD
/**
 * GENOVA AI OS — POST /api/auth/refresh
 * Refreshes session tokens using the refresh token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { refreshSession, extractRefreshToken, refreshSessionCookie } from '@/lib/session';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Rate limit
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = await rateLimit(`refresh:${ip}`, { max: 20, windowMs: 60 * 1000 });
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }
=======
import { NextRequest, NextResponse } from 'next/server';
import { refreshSession, extractRefreshToken, refreshSessionCookie } from '@/lib/session';
import { applySecurity, secureResponse } from '@/lib/security';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  const { error: secError } = await applySecurity(request, {
    rateLimit: { limit: 20, windowMs: 60000 },
  });
  if (secError) return secError;
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)

  try {
    const refreshToken = extractRefreshToken(request);

    if (!refreshToken) {
<<<<<<< HEAD
      return NextResponse.json(
        { error: 'Refresh token is required' },
        { status: 401 }
      );
=======
      const res = NextResponse.json(
        { error: 'Refresh token is required' },
        { status: 401 }
      );
      return secureResponse(res, request);
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)
    }

    const result = await refreshSession(refreshToken);

    if (!result) {
<<<<<<< HEAD
      return NextResponse.json(
        { error: 'Invalid or expired refresh token' },
        { status: 401 }
      );
=======
      const res = NextResponse.json(
        { error: 'Invalid or expired refresh token' },
        { status: 401 }
      );
      return secureResponse(res, request);
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)
    }

    const res = NextResponse.json({
      message: 'Session refreshed successfully',
    });
    refreshSessionCookie(res, result.token, result.refreshToken);
<<<<<<< HEAD
    return res;
  } catch {
    return NextResponse.json(
      { error: 'Session refresh failed' },
      { status: 500 }
    );
=======
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Session refresh failed' },
      { status: 500 }
    );
    return secureResponse(res, request);
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)
  }
}
