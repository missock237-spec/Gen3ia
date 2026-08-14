/**
 * Automation Monitoring API
 * 
 * GET  /api/automations/monitor - Get current running automations
 * GET  /api/automations/monitor?id=<id> - Get execution details
 * GET  /api/automations/monitor?automation=<id> - Get execution history
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { automationMonitor, ExecutionState } from '@/lib/automation/monitor';

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
    const executionId = searchParams.get('id');
    const automationId = searchParams.get('automation');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    if (executionId) {
      // Get specific execution
      const execution = automationMonitor.getExecution(executionId);
      if (!execution) {
        return NextResponse.json(
          { error: 'Execution not found' },
          { status: 404 }
        );
      }

      // Verify user owns this execution
      if (execution.userId !== session.user.id) {
        return NextResponse.json(
          { error: 'Forbidden' },
          { status: 403 }
        );
      }

      return NextResponse.json(execution);
    }

    if (automationId) {
      // Get execution history
      const history = automationMonitor.getExecutionHistory(automationId, limit, offset);
      const metrics = automationMonitor.getMetrics(automationId);

      return NextResponse.json({
        history,
        metrics,
        pagination: { limit, offset },
      });
    }

    // Get all running executions for user
    const runningExecutions = automationMonitor.getRunningExecutions(session.user.id);

    return NextResponse.json({
      running: runningExecutions,
      count: runningExecutions.length,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('[automation-monitor] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
