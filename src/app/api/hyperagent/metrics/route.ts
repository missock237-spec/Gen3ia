// ============================================================
// GET /api/hyperagent/metrics — HyperAgent Performance Metrics
// Returns comprehensive metrics for all 8 modules
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getHyperAgent } from '@/lib/hyperagent';
import { withAuth, type RouteParams } from '@/lib/with-auth';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (request: NextRequest, ctx: { params?: RouteParams }, auth) => {
  try {
    const hyperAgent = getHyperAgent();
    const metrics = hyperAgent.getMetrics();

    return NextResponse.json({
      success: true,
      metrics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      error: 'Erreur lors de la récupération des métriques',
      details: process.env.NODE_ENV === 'development' ? String(error) : undefined,
    }, { status: 500 });
  }
}, {
  requireAuth: true,
  roles: ['user', 'admin'],
  rateLimit: { limit: 60, windowMs: 60000 },
});
