/**
 * Video Extend API — Étendre une vidéo existante
 *
 * POST /api/videos/extend
 * Body: { videoId, prompt, additionalSeconds }
 * - additionalSeconds max: 10
 * - Durée totale max: 20 secondes
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { extendExistingVideo, MAX_EXTENSION_SECONDS, MAX_TOTAL_DURATION_SECONDS } from '@/lib/video-generator';

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

export async function POST(request: NextRequest) {
  const { auth, error } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 10, windowMs: 60000 },
  });

  if (error) return error;
  if (!auth) return secureResponse(NextResponse.json({ error: 'Non authentifié' }, { status: 401 }), request);

  try {
    const body = await request.json();
    const { videoId, prompt, additionalSeconds } = body;

    if (!videoId) {
      return secureResponse(
        NextResponse.json({ error: 'Le champ "videoId" est requis' }, { status: 400 }),
        request
      );
    }

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return secureResponse(
        NextResponse.json({ error: 'Le champ "prompt" est requis' }, { status: 400 }),
        request
      );
    }

    if (!additionalSeconds || additionalSeconds < 1 || additionalSeconds > MAX_EXTENSION_SECONDS) {
      return secureResponse(
        NextResponse.json({
          error: `additionalSeconds doit être entre 1 et ${MAX_EXTENSION_SECONDS} secondes`,
        }, { status: 400 }),
        request
      );
    }

    const result = await extendExistingVideo({
      userId: auth.userId,
      videoId,
      prompt: prompt.trim(),
      additionalSeconds: Math.min(additionalSeconds, MAX_EXTENSION_SECONDS),
    });

    return secureResponse(
      NextResponse.json({
        success: true,
        video: result,
        message: `Vidéo étendue de ${additionalSeconds}s avec succès !`,
      }, { status: 201 }),
      request
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    const status = message.includes('pas') || message.includes('dépassée') || message.includes('entre') ? 400 : 500;

    return secureResponse(
      NextResponse.json({ error: message }, { status }),
      request
    );
  }
}
