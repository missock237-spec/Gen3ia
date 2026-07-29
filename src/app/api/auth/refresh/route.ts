// ============================================================
// POST /api/auth/refresh — Rotation des tokens
// Utilise un refresh token pour obtenir un nouveau
// access token + nouveau refresh token (rotation)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { rotateRefreshToken } from '@/lib/auth/jwt';
import { createLogger } from '@/lib/logger';

const log = createLogger('auth-refresh');

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const refreshToken = body.refreshToken;

    if (!refreshToken) {
      return NextResponse.json(
        { error: 'Refresh token requis' },
        { status: 401 }
      );
    }

    // Rotation du refresh token (ancien blacklisté, nouveau généré)
    const result = await rotateRefreshToken(refreshToken);

    if (!result) {
      log.warn('refresh_failed', { reason: 'token_invalid_or_expired' });
      return NextResponse.json(
        { error: 'Refresh token invalide ou expiré' },
        { status: 401 }
      );
    }

    log.info('refresh_success', { userId: result.userId });

    const response = NextResponse.json({
      accessToken: result.accessToken,
      refreshToken: result.newRefreshToken,
      expiresIn: 15 * 60,
    });

    response.headers.set('Cache-Control', 'no-store');

    return response;
  } catch (error) {
    log.error('refresh_error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Erreur de rafraîchissement de session' },
      { status: 500 }
    );
  }
}
