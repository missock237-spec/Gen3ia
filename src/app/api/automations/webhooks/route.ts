/**
 * Webhook Management API
 * 
 * GET  /api/automations/webhooks - Get webhook delivery status
 * GET  /api/automations/webhooks?dlq=true - Get dead letter queue
 * POST /api/automations/webhooks/replay - Replay webhook
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { webhookRetryEngine } from '@/lib/automation/webhook-retry';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const dlq = searchParams.get('dlq') === 'true';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    if (dlq) {
      // Get dead letter queue
      const deadLettered = webhookRetryEngine.getDeadLetterQueue(limit);
      const metrics = webhookRetryEngine.getMetrics();

      return NextResponse.json({
        deadLetterQueue: deadLettered,
        count: deadLettered.length,
        metrics,
      });
    }

    // Get recent deliveries
    const recent = webhookRetryEngine.getRecentDeliveries(limit);
    const metrics = webhookRetryEngine.getMetrics();

    return NextResponse.json({
      recentDeliveries: recent,
      metrics,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('[webhook-api] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'replay') {
      const body = await request.json();
      const { webhookId } = body;

      if (!webhookId) {
        return NextResponse.json(
          { error: 'webhookId required' },
          { status: 400 }
        );
      }

      const success = await webhookRetryEngine.replayWebhook(webhookId);

      return NextResponse.json({
        success,
        message: success 
          ? 'Webhook replayed successfully' 
          : 'Webhook replay failed',
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[webhook-api] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
