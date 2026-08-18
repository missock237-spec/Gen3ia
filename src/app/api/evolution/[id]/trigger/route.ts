// ============================================================
// Gen3ia Evolution Engine — API: trigger
// ============================================================
//   POST /api/evolution/[id]/trigger   — run the evolution cycle
//   for a record that was created but not yet executed (e.g.
//   after human approval of an L3 plan).
// ============================================================

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { getEvolutionRecord, runEvolutionCycle } from '@/lib/evolution';
import { successResponse, errorResponse, handleApiError, ErrorCode } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export const POST = withAuth<{ id: string }>(async (_req, ctx, _auth) => {
  try {
    const params = await ctx.params; const id = params?.id; if (!id) return errorResponse("Missing id", ErrorCode.VALIDATION_ERROR, 400);
    const record = await getEvolutionRecord(id);
    if (!record) {
      return errorResponse('Evolution not found', ErrorCode.NOT_FOUND, 404);
    }
    if (record.status === 'running') {
      return errorResponse('Evolution already running', ErrorCode.CONFLICT, 409);
    }
    if (record.status === 'deployed' || record.status === 'pr_merged') {
      return errorResponse(`Cannot re-trigger evolution in status ${record.status}`, ErrorCode.CONFLICT, 409);
    }

    // Run synchronously — caller (admin) waits. For long cycles,
    // set up a queue worker instead.
    const updated = await runEvolutionCycle(id);
    return successResponse({ evolution: updated });
  } catch (err) {
    return handleApiError(err);
  }
}, {
  requireAuth: true,
  roles: ['admin'],
  rateLimit: { limit: 5, windowMs: 60 * 1000 },
});

export const OPTIONS = () => new NextResponse(null, { status: 204 });
