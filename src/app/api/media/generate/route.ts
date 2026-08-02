// POST /api/media/generate — Génère images/vidéos via HuggingFace (COÛTEUX)
// SECURITE: withAuth() + quota + rate limit stricte
import { NextRequest, NextResponse } from 'next/server';
import { hfGeneration } from '@/lib/media';
import { createLogger } from '@/lib/logger';
import { withAuth, type RouteParams } from '@/lib/with-auth';





export const dynamic = "force-dynamic";
const log = createLogger('api-media');

export const POST = withAuth(async (request: NextRequest, ctx: { params?: RouteParams }, auth) => {
  try {
    const body = await request.json();
    const { prompt, type = 'image', model, negativePrompt, width, height } = body;
    if (!prompt) return NextResponse.json({ error: 'Prompt requis' }, { status: 400 });

    const enhancedPrompt = await hfGeneration.enhancePrompt(prompt);
    log.info('generating', { userId: auth.userId, type });

    const result = type === 'video'
      ? await hfGeneration.generateVideo(enhancedPrompt, { model, width, height })
      : await hfGeneration.generateImage(enhancedPrompt, { model, negativePrompt, width, height });

    if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });

    log.info('generated', { userId: auth.userId, type, model: result.model, ms: result.latencyMs });
    return NextResponse.json({
      success: true,
      dataUrl: result.dataUrl,
      model: result.model,
      latencyMs: result.latencyMs,
      mimeType: result.mimeType,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur de generation' }, { status: 500 });
  }
}, {
  requireAuth: true,
  roles: ['user'],
  rateLimit: { limit: 5, windowMs: 60000 }, // 5 générations média/min max (très coûteux)
  quota: true, // La génération media consomme des crédits
});
