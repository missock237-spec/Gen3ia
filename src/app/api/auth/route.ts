// ============================================================
// GET /api/auth — Auth info endpoint
// ============================================================
// NOTE: POST /api/auth/login has been moved to /api/auth/login/route.ts

import { NextResponse } from 'next/server';

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
