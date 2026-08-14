/**
 * POST /api/integrations/[id]/execute
 * SECURITE: withAuth() + IDOR corrige (userId du token, pas du body)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getIntegrationExecutor } from '@/lib/integration-engine/executor';
import { getIntegrationRegistry } from '@/lib/integration-engine/registry';
import type { ExecutionRequest } from '@/lib/integration-engine/types';
import { withAuth, type RouteParams } from '@/lib/with-auth';





export const dynamic = "force-dynamic";
export const POST = withAuth(async (request: NextRequest, ctx: { params?: RouteParams }, auth) => {
  try {
    const params = ctx.params ? await ctx.params : {};
    const id = typeof params['id'] === 'string' ? params['id'] : undefined;
    if (!id) return NextResponse.json({ success: false, error: 'Integration id manquant' }, { status: 400 });

    const body = await request.json();
    const { functionId, params: execParams, timeoutMs, priority, fallbackIds } = body;

    if (!functionId) {
      return NextResponse.json({ success: false, error: 'functionId is required' }, { status: 400 });
    }

    const registry = getIntegrationRegistry();
    const integration = registry.getById(id);

    if (!integration) {
      return NextResponse.json({ success: false, error: `Integration not found: ${id}` }, { status: 404 });
    }

    const executor = getIntegrationExecutor();

    const executionRequest: ExecutionRequest = {
      integrationId: id,
      functionId,
      params: execParams || {},
      userId: auth.userId,
      timeoutMs: timeoutMs || undefined,
      priority: priority || 'normal',
    };

    let result;

    if (fallbackIds && Array.isArray(fallbackIds) && fallbackIds.length > 0) {
      result = await executor.executeWithFallback(executionRequest, fallbackIds);
    } else {
      result = await executor.execute(executionRequest);
    }

    const statusCode = result.success ? 200 : 422;

    return NextResponse.json({
      success: result.success,
      data: result.success ? result.data : undefined,
      error: result.success ? undefined : result.error,
      meta: {
        executionTimeMs: result.executionTimeMs,
        provider: result.provider,
        costUsd: result.costUsd,
        metadata: result.metadata,
      },
    }, { status: statusCode });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Execution failed' },
      { status: 500 },
    );
  }
}, {
  requireAuth: true,
  roles: ['user'],
  rateLimit: { limit: 10, windowMs: 60000 },
  quota: true,
});
