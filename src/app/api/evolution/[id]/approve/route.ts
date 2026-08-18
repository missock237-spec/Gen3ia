// ============================================================
// Gen3ia Evolution Engine — API: human approval (L3)
// ============================================================
//   POST /api/evolution/[id]/approve   — admin approves an L3 evolution
// ============================================================

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { grantHumanApproval, getEvolutionRecord } from '@/lib/evolution';
import { successResponse, errorResponse, handleApiError, ErrorCode } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export const POST = withAuth<{ id: string }>(async (_req, ctx, auth) => {
  try {
    const params = await ctx.params; const id = params?.id; if (!id) return errorResponse("Missing id", ErrorCode.VALIDATION_ERROR, 400);
    const ok = await grantHumanApproval(id, auth.userId, auth.role ?? 'user');
    if (!ok) {
      return errorResponse(
        'Approval denied — you must be an admin and the evolution must be in awaiting_review state',
        ErrorCode.FORBIDDEN,
        403
      );
    }
    return successResponse({ evolution: await getEvolutionRecord(id) });
  } catch (err) {
    return handleApiError(err);
  }
}, {
  requireAuth: true,
  roles: ['admin'],
  rateLimit: { limit: 5, windowMs: 60 * 1000 },
});

export const OPTIONS = () => new NextResponse(null, { status: 204 });
