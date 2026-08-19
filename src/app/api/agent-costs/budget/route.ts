import { NextRequest, NextResponse } from 'next/server';
import { budgetGuard } from '@/lib/agent-costs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const agentId = searchParams.get('agentId');

    if (!userId || !agentId) {
      return NextResponse.json(
        { success: false, error: 'userId and agentId parameters are required' },
        { status: 400 }
      );
    }

    const budget = await budgetGuard.getBudget(agentId, userId);

    return NextResponse.json({
      success: true,
      budget,
    });
  } catch (error: any) {
    console.error('[API /api/agent-costs/budget GET Error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch agent budget' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, agentId, dailyLimit, monthlyLimit, alertThreshold, isEnabled } = body;

    if (!userId || !agentId) {
      return NextResponse.json(
        { success: false, error: 'userId and agentId are required' },
        { status: 400 }
      );
    }

    const budget = await budgetGuard.updateBudget(agentId, userId, {
      dailyLimit: dailyLimit !== undefined ? Number(dailyLimit) : undefined,
      monthlyLimit: monthlyLimit !== undefined ? Number(monthlyLimit) : undefined,
      alertThreshold: alertThreshold !== undefined ? Number(alertThreshold) : undefined,
      isEnabled: isEnabled !== undefined ? Boolean(isEnabled) : undefined,
    });

    return NextResponse.json({
      success: true,
      budget,
    });
  } catch (error: any) {
    console.error('[API /api/agent-costs/budget POST Error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to update agent budget' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  return POST(request);
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    let userId = searchParams.get('userId');
    let agentId = searchParams.get('agentId');

    if (!userId || !agentId) {
      try {
        const body = await request.json();
        userId = userId || body.userId;
        agentId = agentId || body.agentId;
      } catch {
        // Ignore body parsing failure if query params missing
      }
    }

    if (!userId || !agentId) {
      return NextResponse.json(
        { success: false, error: 'userId and agentId are required' },
        { status: 400 }
      );
    }

    const success = await budgetGuard.deleteBudget(agentId, userId);

    return NextResponse.json({
      success,
    });
  } catch (error: any) {
    console.error('[API /api/agent-costs/budget DELETE Error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to delete agent budget' },
      { status: 500 }
    );
  }
}
