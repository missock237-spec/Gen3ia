import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';





export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const start = Date.now();
  let dbStatus = 'unknown';
  try {
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
