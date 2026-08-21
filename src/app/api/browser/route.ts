// ============================================================
// POST /api/browser — Crée une session navigateur
// ============================================================
//  Appelé par browser-view.tsx via fetch('/api/browser', { method: 'POST' })
//  Crée un enregistrement de session dans Firestore.
//  Si le sous-système navigateur n'est pas disponible, retourne
//  une session mock avec status='pending'.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/firebase/auth';
import { db } from '@/lib/db';
import { secureResponse } from '@/lib/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) {
  const { applySecurity } = await import('@/lib/security');
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  // Auth via getCurrentUser (Firebase session cookie)
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }

  const userId = user.uid;

  try {
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    const sessionId = `bs_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const createdAt = new Date().toISOString();

    // Try to persist the session in Firestore
    try {
      await db.browserSession.create({
        data: {
          id: sessionId,
          url,
          status: 'pending',
          userId,
          createdAt: new Date(),
        },
      });
    } catch {
      // If the browser subsystem isn't fully connected,
      // continue with a mock session (graceful degradation)
    }

    const res = NextResponse.json({
      id: sessionId,
      url,
      status: 'pending',
      createdAt,
    }, { status: 201 });

    return secureResponse(res, request);
  } catch {
    return NextResponse.json(
      { error: 'Failed to create browser session' },
      { status: 500 },
    );
  }
}
