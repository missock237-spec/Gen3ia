import { NextRequest, NextResponse } from 'next/server';
import { agentCostTracker, budgetGuard } from '@/lib/agent-costs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const agentId = searchParams.get('agentId') || undefined;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId parameter is required' },
        { status: 400 }
      );
    }

    const breakdown = await agentCostTracker.getCostBreakdown(userId, {
      agentId,
      startDate,
      endDate,
    });

    return NextResponse.json({
      success: true,
      ...breakdown,
    });
  } catch (error: any) {
    console.error('[API /api/agent-costs GET Error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch cost analytics' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      agentId,
      conversationId,
      userId,
      model,
      inputTokens,
      outputTokens,
      totalTokens,
      costInCredits,
    } = body;

    if (!agentId || !userId) {
      return NextResponse.json(
        { success: false, error: 'agentId and userId are required fields' },
        { status: 400 }
      );
    }

    const budgetCheck = await budgetGuard.checkBudget(agentId, userId);

    if (!budgetCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: budgetCheck.reason || 'Budget limit exceeded for this agent',
          remaining: budgetCheck.remaining,
        },
        { status: 403 }
      );
    }

    const record = await agentCostTracker.trackCost({
      agentId,
      conversationId: conversationId || 'default',
      userId,
      model: model || 'gpt-4o',
      inputTokens: Number(inputTokens) || 0,
      outputTokens: Number(outputTokens) || 0,
      totalTokens:
        Number(totalTokens) ||
        (Number(inputTokens) || 0) + (Number(outputTokens) || 0),
      costInCredits: Number(costInCredits) || 0,
      timestamp: new Date().toISOString(),
    });

    const alertInfo = await budgetGuard.triggerAlert(agentId, userId, 0.8);

    return NextResponse.json({
      success: true,
      record,
      budgetCheck,
      alert: alertInfo,
    });
  } catch (error: any) {
    console.error('[API /api/agent-costs POST Error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to record cost entry' },
      { status: 500 }
    );
  }
}
