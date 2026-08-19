import { NextRequest, NextResponse } from 'next/server';
import { agentDebugger } from '@/lib/agent-debug';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const run = await agentDebugger.getRun(runId);

    if (!run) {
      return NextResponse.json(
        { error: 'Run not found' },
        { status: 404 }
      );
    }

    const format = request.nextUrl.searchParams.get('format');
    if (format === 'json' || format === 'markdown') {
      const exported = await agentDebugger.exportRun(runId, format);
      return new NextResponse(exported, {
        headers: {
          'Content-Type': format === 'json' ? 'application/json' : 'text/markdown',
        },
      });
    }

    return NextResponse.json(run);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch debug run' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const success = await agentDebugger.deleteRun(runId);

    if (!success) {
      return NextResponse.json(
        { error: 'Run not found or could not be deleted' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to delete debug run' },
      { status: 500 }
    );
  }
}
