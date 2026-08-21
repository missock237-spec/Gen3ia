// ============================================================
// GET /api/auth/debug — Auth system diagnostic
// ============================================================
// Public endpoint that tests each auth component without
// requiring authentication. Returns detailed status info.
// ============================================================

import { NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase/admin';
import { isFirebaseClientConfigured, getFirebaseInitError } from '@/lib/firebase/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const results: Record<string, unknown> = { timestamp: new Date().toISOString() };

  // 1. Firebase Admin SDK
  try {
    const auth = getAdminAuth();
    const app = auth.app;
    results.adminApp = { ok: true, name: app.name, options: Object.keys(app.options) };

    // Test listUsers (minimal)
    const start = Date.now();
    await auth.listUsers({ maxResults: 1 });
    results.adminListUsers = { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    results.adminApp = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  // 2. Environment variables
  results.env = {
    hasServiceAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT,
    hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
    hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
    hasApiKey: !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    hasAuthDomain: !!process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    hasProjectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    hasAppId: !!process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    nodeEnv: process.env.NODE_ENV,
  };

  // 3. Firebase config validation
  try {
    const configCheck = isFirebaseClientConfigured();
    results.clientConfig = configCheck;
  } catch {
    results.clientConfig = { ok: false, note: 'Server-side check' };
  }
  const initErr = getFirebaseInitError();
  results.clientInitError = initErr || null;

  // 4. Session cookie test
  try {
    const { SESSION_COOKIE_NAME, SESSION_COOKIE_MAX_AGE, SESSION_COOKIE_MAX_AGE_SHORT } = await import('@/lib/firebase/config');
    results.sessionConfig = {
      cookieName: SESSION_COOKIE_NAME,
      maxAge14d: SESSION_COOKIE_MAX_AGE,
      maxAge24h: SESSION_COOKIE_MAX_AGE_SHORT,
    };
  } catch (err) {
    results.sessionConfig = { error: err instanceof Error ? err.message : String(err) };
  }

  // 5. Database connectivity
  try {
    const { db } = await import('@/lib/firebase/firestore');
    const start = Date.now();
    // Try a simple read that won't crash
    const testDoc = await db.user.findUnique({ where: { id: '__debug_nonexistent__' } });
    results.firestore = { ok: true, latencyMs: Date.now() - start, testResult: testDoc };
  } catch (err) {
    results.firestore = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  return NextResponse.json(results);
}
