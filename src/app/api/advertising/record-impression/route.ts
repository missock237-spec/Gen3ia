import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { getAdEngine } from '@/lib/advertising/ad-engine';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * POST /api/advertising/record-impression
 * 
 * Record an ad impression (ad view)
 * Handles reward crediting for premium users
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userIdFromSession = session.user.id;

    const { impressionId, campaignId, userId, sessionId, adType } = await request.json();

    // Validate required fields
    if (!impressionId || !campaignId || !sessionId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Verify user ownership
    if (userId !== userIdFromSession) {
      return NextResponse.json(
        { error: 'User mismatch' },
        { status: 403 }
      );
    }

    const adEngine = getAdEngine();

    // Record the impression
    const result = await adEngine.recordImpression(
      userId,
      campaignId,
      adType || 'unrewarded',
      sessionId
    );

    logger.logRequest(
      'POST',
      '/api/advertising/record-impression',
      200,
      0,
      userIdFromSession
    );

    return NextResponse.json({
      success: true,
      impressionId: result.impressionId,
      rewardCredited: result.rewardCredited,
      rewardAmount: result.rewardAmount,
    });
  } catch (error) {
    logger.error('Failed to record impression', {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { error: 'Failed to record impression' },
      { status: 500 }
    );
  }
}
