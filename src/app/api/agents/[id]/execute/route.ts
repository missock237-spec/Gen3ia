import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, userId, task } = body;
    if (!agentId || !userId || !task) return NextResponse.json({ error: 'agentId, userId et task requis' }, { status: 400 });
    const execution = await db.agentExecution.create({ data: { agentId, userId, task, status: 'running', steps: '[]', currentStep: 0, totalSteps: 1 } });
    return NextResponse.json({ executionId: execution.id, status: 'running' });
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
