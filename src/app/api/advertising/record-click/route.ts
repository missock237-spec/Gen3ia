import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getAdEngine } from '@/lib/advertising/ad-engine';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * POST /api/advertising/record-click
 * 
 * Record an ad click
 * Handles reward crediting for premium users
 */
export async function POST(request: NextRequest) {
  try {
    const token = await getToken({ req: request });
    if (!token?.sub) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { impressionId, userId, _adType } = await request.json();

    // Validate required fields
    if (!impressionId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Verify user ownership
    if (userId && userId !== token.sub) {
      return NextResponse.json(
        { error: 'User mismatch' },
        { status: 403 }
      );
    }

    const adEngine = getAdEngine();

    // Record the click
    const result = await adEngine.recordClick(impressionId);

    logger.logRequest(
      'POST',
      '/api/advertising/record-click',
      200,
      0,
      token.sub
    );

    return NextResponse.json({
      success: true,
      rewardCredited: result.rewardCredited,
      rewardAmount: result.rewardAmount,
      redirectUrl: result.redirectUrl,
    });
  } catch (error) {
    logger.error('Failed to record click', {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: 'Failed to record click' },
      { status: 500 }
    );
  }
}
