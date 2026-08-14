import { NextRequest, NextResponse } from 'next/server';
import { replayEngine } from '@/lib/agent-debug';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const body = await request.json();
    const { modifiedSteps = [], stopAtStepId } = body;

    const newRun = await replayEngine.replay({
      runId,
      modifiedSteps,
      stopAtStepId,
    });

    return NextResponse.json(newRun, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to replay debug run' },
      { status: 500 }
    );
  }
}
