import { NextRequest, NextResponse } from 'next/server';
import { getVoiceAgentEngine } from '@/lib/voice/voice-agent';
import { getAuthenticatedUser } from '@/lib/session';
import { db } from '@/lib/db';
import { errorResponse, successResponse, ErrorCode, handleApiError } from '@/lib/api-error';





export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return errorResponse('Non authentifié', ErrorCode.UNAUTHORIZED, 401);

    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action') || 'list';

    switch (action) {
      case 'agents': {
        const agents = await db.agent.findMany({
          where: { userId: user.userId, type: 'voice' },
          orderBy: { createdAt: 'desc' },
        });
        return successResponse({ agents });
      }

      case 'history': {
        const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
        const cursor = searchParams.get('cursor');
        const calls = await db.voiceCall.findMany({
          where: { userId: user.userId },
          orderBy: { createdAt: 'desc' },
          take: limit + 1,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        const hasMore = calls.length > limit;
        const data = hasMore ? calls.slice(0, limit) : calls;
        return successResponse({
          calls: data,
          pagination: { hasMore, nextCursor: data.length > 0 ? data[data.length - 1].id : null },
        });
      }

      case 'stats': {
        const [total, completed, duration] = await Promise.all([
          db.voiceCall.count({ where: { userId: user.userId } }),
          db.voiceCall.count({ where: { userId: user.userId, status: 'completed' } }),
          db.voiceCall.aggregate({ where: { userId: user.userId }, _sum: { durationSeconds: true } }),
        ]);
        return successResponse({
          totalCalls: total,
          completedCalls: completed,
          totalDurationSeconds: duration._sum.durationSeconds || 0,
        });
      }

      default:
        return errorResponse('Action non reconnue', ErrorCode.BAD_REQUEST, 400);
    }
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return errorResponse('Non authentifié', ErrorCode.UNAUTHORIZED, 401);

    const body = await request.json();
    const { action, ...params } = body;
    const engine = getVoiceAgentEngine();

    switch (action) {
      case 'create-agent': {
        if (!params.name) return errorResponse('Nom requis', ErrorCode.VALIDATION_ERROR, 400);
        const result = await engine.createVoiceAgent(user.userId, params.name, params.config || {});
        return successResponse(result, 201);
      }

      case 'make-call': {
        const { agentId, toNumber, fromNumber } = params;
        if (!agentId || !toNumber || !fromNumber) {
          return errorResponse('agentId, toNumber et fromNumber requis', ErrorCode.VALIDATION_ERROR, 400);
        }
        const result = await engine.makeCall(user.userId, agentId, toNumber, fromNumber, params.context);
        return successResponse(result);
      }

      case 'end-call': {
        if (!params.callSid) return errorResponse('callSid requis', ErrorCode.VALIDATION_ERROR, 400);
        await engine.endCall(params.callSid);
        return successResponse({ success: true });
      }

      default:
        return errorResponse('Action non reconnue', ErrorCode.BAD_REQUEST, 400);
    }
  } catch (error) {
    return handleApiError(error);
  }
}
