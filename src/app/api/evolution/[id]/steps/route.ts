// ============================================================
// Gen3ia Evolution Engine — API: steps
// ============================================================
//   GET /api/evolution/[id]/steps   — list steps for an evolution
// ============================================================

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { listSteps } from '@/lib/evolution';
import { successResponse, errorResponse, handleApiError, ErrorCode } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

export const GET = withAuth<{ id: string }>(async (_req, ctx, _auth) => {
  try {
    const params = await ctx.params;
    const id = params?.id;
    if (!id) return errorResponse('Missing id', ErrorCode.VALIDATION_ERROR, 400);
    const steps = await listSteps(id);
    return successResponse({ steps, count: steps.length });
  } catch (err) {
    return handleApiError(err);
  }
}, {
  requireAuth: true,
  roles: ['admin'],
  rateLimit: { limit: 60, windowMs: 60 * 1000 },
});

export const OPTIONS = () => new NextResponse(null, { status: 204 });
