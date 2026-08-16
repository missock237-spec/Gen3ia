// ============================================================
// GET /api/health — Health check (connectivité + uptime)
// ============================================================
//  Utilisé par le service worker pour détecter si le réseau
//  est réellement disponible. Léger, pas de DB, pas de log.
// ============================================================

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const startTime = Date.now();

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: Math.floor((Date.now() - startTime) / 1000),
  });
}
