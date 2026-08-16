import { NextRequest, NextResponse } from 'next/server';
import { agentDebugger } from '@/lib/agent-debug';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const agentId = searchParams.get('agentId') || '';
    const userId = searchParams.get('userId') || '';
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 50;

    const runs = await agentDebugger.getRunsByAgent(agentId, userId, limit);
    return NextResponse.json(runs);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch debug runs' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, userId, conversationId } = body;

    if (!agentId || !userId) {
      return NextResponse.json(
        { error: 'agentId and userId are required' },
        { status: 400 }
      );
    }

    const runId = await agentDebugger.startRun(
      agentId,
      userId,
      conversationId || `conv-${Date.now()}`
    );

    return NextResponse.json({ runId }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to start debug run' },
      { status: 500 }
    );
  }
}
