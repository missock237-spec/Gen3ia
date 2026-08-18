// POST /api/videos/generate — Créer une génération de vidéo
// SECURITE: withAuth() + correction IDOR (userId du token, pas du body) + quota
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withAuth, type RouteParams } from '@/lib/with-auth';

export const dynamic = "force-dynamic";
export const POST = withAuth(async (request: NextRequest, ctx: { params?: RouteParams }, auth) => {
  try {
    const b = await request.json();
    const { prompt } = b;
    // SECURITY: userId vient du token authentifié — JAMAIS du body client (prévient IDOR)
    if (!prompt) return NextResponse.json({ error: 'Prompt requis' }, { status: 400 });
    if (prompt.length > 5000) return NextResponse.json({ error: 'Prompt trop long' }, { status: 400 });

    const v = await db.videoGeneration.create({ data: { userId: auth.userId, prompt, provider: 'huggingface', status: 'processing' } });
    return NextResponse.json({ generationId: v.id, status: 'processing' });
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}, {
  requireAuth: true,
  roles: ['user'],
  rateLimit: { limit: 5, windowMs: 60000 }, // 5 générations vidéo/min max (très coûteux)
  quota: true, // Les vidéos consomment des crédits
});
