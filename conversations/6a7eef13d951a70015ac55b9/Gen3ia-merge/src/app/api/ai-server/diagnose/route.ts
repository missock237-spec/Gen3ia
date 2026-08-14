/**
 * GET/POST /api/ai-server/diagnose — Run full SaaS diagnostics
 * SECURITE: Diagnostiques internes = réservés aux ADMIN uniquement.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runDiagnostics } from '@/lib/ai-integration-server/saas-doctor';
import { withAuth, type RouteParams } from '@/lib/with-auth';



// GET — Diagnostics complets (admin only)


export const dynamic = "force-dynamic";
export const GET = withAuth(async (request: NextRequest, ctx: { params?: RouteParams }, auth) => {
  try {
    const report = await runDiagnostics();
    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Diagnostics failed' },
      { status: 500 },
    );
  }
}, {
  requireAuth: true,
  roles: ['admin'],
  rateLimit: { limit: 10, windowMs: 60000 },
});

// POST — Diagnostics avec options (admin only)
export const POST = withAuth(async (request: NextRequest, ctx: { params?: RouteParams }, auth) => {
  try {
    const body = await request.json().catch(() => ({}));
    const { category } = body as { category?: string };

    const report = await runDiagnostics();

    if (category) {
      const filteredChecks = report.checks.filter(c => c.category === category);
      return NextResponse.json({
        success: true,
        data: {
          ...report,
          checks: filteredChecks,
          summary: {
            total: filteredChecks.length,
            healthy: filteredChecks.filter(c => c.severity === 'healthy').length,
            warnings: filteredChecks.filter(c => c.severity === 'warning').length,
            critical: filteredChecks.filter(c => c.severity === 'critical').length,
          },
        },
      });
    }

    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Diagnostics failed' },
      { status: 500 },
    );
  }
}, {
  requireAuth: true,
  roles: ['admin'],
  rateLimit: { limit: 10, windowMs: 60000 },
});
