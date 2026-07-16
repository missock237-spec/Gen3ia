import { NextRequest, NextResponse } from 'next/server';
import { agentOrchestrator } from '@/lib/agent/orchestrator';

export async function POST(request: NextRequest) {
  try {
    const { userId, platform } = await request.json();
    if (!userId || !platform) {
      return NextResponse.json({ error: 'userId et platform requis' }, { status: 400 });
    }
    await agentOrchestrator.disconnect(userId, platform);
    return NextResponse.json({ success: true, message: 'Acces revoque' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
