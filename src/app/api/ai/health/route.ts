import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = "force-dynamic";
export async function GET(_request: NextRequest) {
  const start = Date.now();
  let dbStatus = 'unknown';
  try {
// @ts-ignore — type narrowing pending, see refactor ticket
    await db.$queryRaw`SELECT 1`;
    dbStatus = 'connected';
  } catch {
    dbStatus = 'disconnected';
  }
  return NextResponse.json({
    status: dbStatus === 'connected' ? 'ok' : 'degraded',
    model: 'genova',
    database: dbStatus,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    responseTimeMs: Date.now() - start,
  });
}
