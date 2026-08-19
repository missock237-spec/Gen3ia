import { NextRequest, NextResponse } from 'next/server';
import { agentMemorySystem } from '@/lib/agent-memory-system';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, userId, conversationId, currentTopic, userMessage } = body;

    if (!agentId || !userId) {
      return NextResponse.json(
        { error: 'agentId and userId are required' },
        { status: 400 }
      );
    }

    const memories = await agentMemorySystem.recall({
      agentId,
      userId,
      conversationId,
      currentTopic,
      userMessage,
    });

    return NextResponse.json({ success: true, memories });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to recall memories' },
      { status: 500 }
    );
  }
}
