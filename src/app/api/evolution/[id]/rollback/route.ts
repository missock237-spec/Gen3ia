// ============================================================
// Gen3ia Evolution Engine — API: rollback
// ============================================================
//   POST /api/evolution/[id]/rollback   — manually trigger rollback
//   Body: { "reason": "..." }
// ============================================================

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { z } from 'zod';
import { getEvolutionRecord, triggerRollback } from '@/lib/evolution';
import { successResponse, errorResponse, handleApiError, ErrorCode } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

const ReasonSchema = z.object({
  reason: z.string().min(1).max(1000),
});

export const POST = withAuth<{ id: string }>(async (req, ctx, _auth) => {
  try {
    const params = await ctx.params; const id = params?.id; if (!id) return errorResponse("Missing id", ErrorCode.VALIDATION_ERROR, 400);
    const record = await getEvolutionRecord(id);
    if (!record) {
      return errorResponse('Evolution not found', ErrorCode.NOT_FOUND, 404);
    }
    if (record.status === 'rolled_back') {
      return errorResponse('Evolution already rolled back', ErrorCode.CONFLICT, 409);
    }
    if (!record.headSha) {
      return errorResponse('No headSha to revert', ErrorCode.CONFLICT, 409);
    }
    const body = await req.json().catch(() => null);
    const parsed = ReasonSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse('Invalid input', ErrorCode.VALIDATION_ERROR, 400, {
        issues: parsed.error.issues,
      });
    }
    await triggerRollback(id, parsed.data.reason);
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
