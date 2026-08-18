/**
 * Prometheus Metrics Scrape Endpoint
 *
 * GET /api/monitoring/metrics
 *
 * Exposes all Gen3ia.AI metrics in Prometheus exposition format
 * for scraping by Prometheus server.
 *
 * This endpoint is excluded from OpenTelemetry tracing to avoid noise.
 *
 * SÉCURITÉ (hardened) :
 * - Layer 1 (middleware) : admin-only sur /api/monitoring/*
 * - Layer 2 (cette route) : API key (METRICS_API_KEY) OU session Firebase
 *   admin vérifiée cryptographiquement via applySecurity().
 * - Localhost autorisé en développement.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMetrics, getMetricsContentType } from '@/lib/monitoring/metrics';
import { applySecurity } from '@/lib/security';

export const dynamic = 'force-dynamic';

/**
 * Verify access to monitoring metrics scrape endpoint.
 * Same policy as /api/metrics — API key OR admin session OR localhost dev.
 */
async function verifyMonitoringAccess(request: NextRequest): Promise<boolean> {
  // 1. API key (Prometheus server-to-server)
  const apiKey = request.headers.get('x-api-key');
  const expectedKey = process.env.METRICS_API_KEY;
  if (apiKey && expectedKey && apiKey === expectedKey) {
    return true;
  }

  // 2. Admin session via Firebase (cryptographic verification)
  try {
    const { auth } = await applySecurity(request, {
      requireAuth: true,
      requireRole: 'admin',
    });
    if (auth?.role === 'admin') {
      return true;
    }
  } catch (_e) {
    // Token verification failed
  }

  // 3. Localhost in development
  if (process.env.NODE_ENV === 'development') {
    const host = request.headers.get('host') || '';
    if (host.startsWith('127.0.0.1') || host.startsWith('localhost')) {
      return true;
    }
  }

  return false;
}

export async function GET(request: NextRequest) {
  // Layer 2 — verify access before exposing Prometheus metrics.
  const ok = await verifyMonitoringAccess(request);
  if (!ok) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 },
    );
  }

  try {
    const metricsText = await getMetrics();
    const contentType = getMetricsContentType();

    return new NextResponse(metricsText, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to collect metrics', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
