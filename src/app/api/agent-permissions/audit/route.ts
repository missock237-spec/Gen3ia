import { NextResponse, type NextRequest } from 'next/server';
import { auditLogger } from '@/lib/agent-permissions';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId') || '';
    const userId = searchParams.get('userId') || '';
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 50;

    const entries = await auditLogger.getAuditLog(agentId, userId, isNaN(limit) ? 50 : limit);

    return NextResponse.json({ success: true, auditLog: entries });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to retrieve audit log' },
      { status: 500 }
    );
  }
}
