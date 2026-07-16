// POST /api/agent/approve
import { NextRequest, NextResponse } from 'next/server';
import { agentOrchestrator } from '@/lib/agent/orchestrator';

export async function POST(request: NextRequest) {
  try {
    const { userId, approvalId, approved } = await request.json();
    if (!userId || !approvalId) {
      return NextResponse.json({ error: 'userId et approvalId requis' }, { status: 400 });
    }
    const result = await agentOrchestrator.approve(userId, approvalId, approved);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
