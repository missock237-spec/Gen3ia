import { NextResponse } from 'next/server';
import { refreshExpiredTokens } from '@/lib/oauth/token-refresher';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
// @ts-ignore
    const authHeader = (await import('next/headers')).headers().then(h => h.get('authorization'));
    const expectedToken = process.env.CRON_SECRET;
    const actualToken = (await authHeader)?.replace('Bearer ', '');
    if (expectedToken && actualToken !== expectedToken) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 });
    }

    const result = await refreshExpiredTokens();

    return NextResponse.json({
      success: true,
      message: `Rafraichissement automatique termine`,
      refreshed: result.refreshed,
      failed: result.failed,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('CRON /refresh-tokens error:', error);
    return NextResponse.json({ error: 'Erreur cron' }, { status: 500 });
  }
}
