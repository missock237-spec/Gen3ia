// ============================================================
// GET /api/images/[id] — Statut d'une generation d'image
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { applySecurity } from '@/lib/security';





export const dynamic = "force-dynamic";
const log = createLogger('image-status');

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) {
    return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });
  }

  try {
    const generation = await db.imageGeneration.findUnique({
      where: { id: (await params).id },
      select: {
        id: true,
        status: true,
        prompt: true,
        model: true,
        imageUrl: true,
        width: true,
        height: true,
        costUsd: true,
        metadata: true,
        completedAt: true,
        createdAt: true,
        userId: true,
      },
    });

    if (!generation) {
      return NextResponse.json({ error: 'Generation introuvable' }, { status: 404 });
    }

    if (generation.userId !== auth.userId) {
      return NextResponse.json({ error: 'Acces refuse' }, { status: 403 });
    }

    const metadata = typeof generation.metadata === 'string'
      ? JSON.parse(generation.metadata)
      : generation.metadata || {};

    return NextResponse.json({
      success: true,
      data: {
        id: generation.id,
        status: generation.status,
        prompt: generation.prompt,
        model: generation.model,
        imageUrl: generation.imageUrl,
        width: generation.width,
        height: generation.height,
        cost: generation.costUsd,
        error: metadata.error || null,
        completedAt: generation.completedAt,
        createdAt: generation.createdAt,
      },
    });
  } catch (error) {
    log.error('image_status_error', { error: String(error) });
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
  }
}
