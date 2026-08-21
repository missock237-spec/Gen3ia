// ============================================================
// GET /api/auth — Auth info endpoint
// POST /api/auth — Alias vers /api/auth/login (compatibilité)
// ============================================================
// NOTE: POST /api/auth/login has been moved to /api/auth/login/route.ts

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    endpoints: [
      'POST /api/auth/login',
      'POST /api/auth/register',
      'GET  /api/auth/me',
      'POST /api/auth/logout',
      'POST /api/auth/forgot-password',
      'POST /api/auth/reset-password',
      'POST /api/auth/send-verification',
      'POST /api/auth/verify-email',
    ],
  });
}

// Alias : POST /api/auth redirige vers la même logique que /api/auth/login
// pour la compatibilité avec les anciens clients.
export async function POST(req: NextRequest) {
  const { POST: loginPost } = await import('./login/route');
  return loginPost(req);
}
