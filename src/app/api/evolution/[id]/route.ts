// ============================================================
// Gen3ia Evolution Engine — API: single evolution
// ============================================================
//   GET    /api/evolution/[id]   — fetch one evolution record
//   DELETE /api/evolution/[id]   — cancel a running evolution
// ============================================================

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { getEvolutionRecord, updateEvolutionRecord, listSteps } from '@/lib/evolution';
import { successResponse, errorResponse, handleApiError, ErrorCode } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export const GET = withAuth<{ id: string }>(async (_req, ctx, _auth) => {
  try {
    const params = await ctx.params; const id = params?.id; if (!id) return errorResponse("Missing id", ErrorCode.VALIDATION_ERROR, 400);
    const record = await getEvolutionRecord(id);
    if (!record) {
      return errorResponse('Evolution not found', ErrorCode.NOT_FOUND, 404);
    }
    const steps = await listSteps(id);
    return successResponse({ evolution: record, steps });
  } catch (err) {
    return handleApiError(err);
  }
}, {
  requireAuth: true,
  roles: ['admin'],
  rateLimit: { limit: 60, windowMs: 60 * 1000 },
});

export const DELETE = withAuth<{ id: string }>(async (_req, ctx, _auth) => {
  try {
    const params = await ctx.params; const id = params?.id; if (!id) return errorResponse("Missing id", ErrorCode.VALIDATION_ERROR, 400);
    const record = await getEvolutionRecord(id);
    if (!record) {
      return errorResponse('Evolution not found', ErrorCode.NOT_FOUND, 404);
    }
    if (record.status === 'running' || record.status === 'awaiting_review') {
      await updateEvolutionRecord(id, {
        status: 'cancelled',
        endedAt: new Date().toISOString(),
        lastError: 'cancelled by user',
      });
      return successResponse({ evolution: await getEvolutionRecord(id) });
    }
    return errorResponse(
      `Cannot cancel evolution in status ${record.status}`,
      ErrorCode.CONFLICT,
      409
    );
  } catch (err) {
    return handleApiError(err);
  }
}, {
  requireAuth: true,
  roles: ['admin'],
  rateLimit: { limit: 10, windowMs: 60 * 1000 },
});

export const OPTIONS = () => new NextResponse(null, { status: 204 });
