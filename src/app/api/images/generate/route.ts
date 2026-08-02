// ============================================================
// POST /api/images/generate - Generation d'images via HF
// SECURITE: withAuth() uniformisé + rate limit + crédits déjà débités
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { withAuth } from '@/lib/with-auth';
import { queryHF, bufferToBase64 } from '@/lib/huggingface';





export const dynamic = "force-dynamic";
const log = createLogger('image-generate');

const MODELS = {
  'flux': 'black-forest-labs/FLUX.1-dev',
  'sdxl': 'stabilityai/stable-diffusion-xl-base-1.0',
  'sd3': 'stabilityai/stable-diffusion-3.5-large',
  'animagine': 'cagliostrolab/animagine-xl-3.1',
} as const;

export const POST = withAuth(async (request: NextRequest, ctx: { params?: Promise<any> }, auth) => {
  try {
    const body = await request.json();
    const { prompt, model = 'flux', negativePrompt, width = 1024, height = 1024, steps } = body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return NextResponse.json({ error: 'Prompt requis' }, { status: 400 });
    }

    if (prompt.length > 2000) {
      return NextResponse.json({ error: 'Prompt trop long (max 2000 caracteres)' }, { status: 400 });
    }

    const modelId = MODELS[model as keyof typeof MODELS];
    if (!modelId) {
      return NextResponse.json({
        error: `Modele invalide. Modeles disponibles: ${Object.keys(MODELS).join(', ')}`,
      }, { status: 400 });
    }

    // Verifier credits
    const user = await db.user.findUnique({
      where: { id: auth.userId },
      select: { credits: true, plan: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
    }

    const costInCredits = model === 'flux' ? 5 : 10;
    if (user.credits < costInCredits) {
      return NextResponse.json({
        error: `Credits insuffisants. Besoin: ${costInCredits}, Solde: ${user.credits}`,
      }, { status: 402 });
    }

    // Creer l'enregistrement
    const generation = await db.imageGeneration.create({
      data: {
        userId: auth.userId,
        prompt,
        model: modelId,
        provider: 'huggingface',
        status: 'processing',
        width,
        height,
        metadata: JSON.stringify({ negativePrompt, steps }),
      },
    });

    log.info('image_generation_started', {
      generationId: generation.id,
      model: modelId,
      promptLength: prompt.length,
    });

    // Appel HF de maniere asynchrone
    const hfPayload: Record<string, unknown> = {
      inputs: prompt,
      parameters: {
        width,
        height,
        num_inference_steps: steps || (model === 'flux' ? 28 : 30),
        ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
      },
    };

    // On lance l'appel HF sans bloquer la reponse
    queryHF(modelId, hfPayload)
      .then(async (response) => {
        if (!response.ok) {
          const errText = await response.text().catch(() => 'unknown');
          await db.imageGeneration.update({
            where: { id: generation.id },
            data: {
              status: 'failed',
              metadata: JSON.stringify({ error: `HF error (${response.status}): ${errText.slice(0, 500)}` }),
            },
          });
          log.error('image_generation_failed', { generationId: generation.id, error: errText.slice(0, 200) });
          return;
        }

        const buffer = await response.arrayBuffer();
        const base64 = await bufferToBase64(buffer);
        const dataUrl = `data:image/webp;base64,${base64}`;

        await db.imageGeneration.update({
          where: { id: generation.id },
          data: {
            status: 'completed',
            imageUrl: dataUrl,
            costUsd: costInCredits,
            completedAt: new Date(),
          },
        });

        // Debiter les credits
        await db.user.update({
          where: { id: auth.userId },
          data: { credits: { decrement: costInCredits } },
        });

        log.info('image_generation_completed', {
          generationId: generation.id,
          size: buffer.byteLength,
          cost: costInCredits,
        });
      })
      .catch(async (error) => {
        const msg = error instanceof Error ? error.message : String(error);
        await db.imageGeneration.update({
          where: { id: generation.id },
          data: { status: 'failed', metadata: JSON.stringify({ error: msg }) },
        });
        log.error('image_generation_crashed', { generationId: generation.id, error: msg });
      });

    return NextResponse.json({
      success: true,
      generationId: generation.id,
      status: 'processing',
      model: modelId,
      cost: costInCredits,
    });

  } catch (error) {
    log.error('image_generation_route_error', { error: String(error) });
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
  }
}, {
  requireAuth: true,
  roles: ['user'],
  rateLimit: { limit: 10, windowMs: 60000 }, // 10 générations/min max (coûteux)
});
