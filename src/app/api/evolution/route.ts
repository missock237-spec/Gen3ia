// ============================================================
// Gen3ia Evolution Engine — API: list & create
// ============================================================
//   GET  /api/evolution           — list recent evolutions
//   POST /api/evolution           — start a new evolution cycle
//
// Both admin-only: evolving the engine is a privileged action.
// Rate-limited at 5/min for POST (each cycle is expensive).
// ============================================================

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { z } from 'zod';
import { startEvolution } from '@/lib/evolution';
import { listEvolutionRecords } from '@/lib/evolution';
import { successResponse, errorResponse, handleApiError, ErrorCode } from '@/lib/api-error';
import { getEvolutionEnv } from '@/lib/evolution';

export const dynamic = 'force-dynamic';

const CreateSchema = z.object({
  scope: z.string().min(1).max(80),
  motivation: z.string().min(1).max(2000),
  targetBranch: z.string().min(1).max(80).optional(),
});

export const GET = withAuth(async (_req, _ctx, auth) => {
  try {
    const url = _req.nextUrl;
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 200);
    const statusParam = url.searchParams.get('status');
    const triggeredBy = url.searchParams.get('triggeredBy');

    const items = await listEvolutionRecords({
      limit,
      status: statusParam as Parameters<typeof listEvolutionRecords>[0] extends { status?: infer S } ? S : never,
      triggeredBy: triggeredBy ?? undefined,
    });

    return successResponse({ items, count: items.length });
  } catch (err) {
    return handleApiError(err);
  }
}, {
  requireAuth: true,
  roles: ['admin'],
  rateLimit: { limit: 30, windowMs: 60 * 1000 },
});

export const POST = withAuth(async (req, _ctx, auth) => {
  try {
    const env = getEvolutionEnv();
    if (!env.EVOLUTION_ENABLED) {
      return errorResponse('Evolution Engine is disabled', ErrorCode.BAD_REQUEST, 400);
    }

    const body = await req.json().catch(() => null);
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse('Invalid input', ErrorCode.VALIDATION_ERROR, 400, {
        issues: parsed.error.issues,
      });
    }

    const record = await startEvolution({
      triggeredBy: auth.userId,
      scope: parsed.data.scope,
      motivation: parsed.data.motivation,
      targetBranch: parsed.data.targetBranch ?? env.EVOLUTION_TARGET_BRANCH,
    });

    // Kick off the cycle in the background — the route returns immediately
    // with the evolution id so the client can poll status.
    // (In Vercel prod with `maxDuration: 300`, we use waitUntil if available;
    // here we just fire-and-forget and rely on the heartbeat + lock to detect crashes.)
    void import('@/lib/evolution').then(({ runEvolutionCycle }) => {
      runEvolutionCycle(record.id).catch(() => undefined);
    });

    return successResponse({ evolution: record }, 202);
  } catch (err) {
    return handleApiError(err);
  }
}, {
  requireAuth: true,
  roles: ['admin'],
  rateLimit: { limit: 5, windowMs: 60 * 1000 },
  quota: true,
});

export const OPTIONS = () => new NextResponse(null, { status: 204 });
