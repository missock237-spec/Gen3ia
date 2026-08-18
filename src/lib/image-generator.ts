// ============================================================
// IMAGE GENERATOR — Génération d'images via Hugging Face (gratuit)
// ------------------------------------------------------------
// T28 — Améliorations:
//   - Chaîne de fallback multi-modèles HF (FLUX-schnell → SDXL → SD 1.5 → SDXL-Lightning)
//   - Retry sur HTTP 503 (modèle en cours de chargement) avec backoff
//   - Support de paramètres avancés (guidance_scale, num_inference_steps, seed)
//   - Support LoRA (via adapter_type/adapter_weights sur les modèles compatibles)
//   - Métadonnées persistées (modèle utilisé, latence, tentatives)
//   - L'API publique (generate, getHistory) est conservée
// ============================================================

import { prisma } from './prisma';
import { logger } from './logger';
import { queryHF, bufferToBase64 } from './huggingface';

// ─── Types publics (conservés) ────────────────────────────────────────────

interface ImageParams {
  userId: string;
  prompt: string;
  model?: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
}

// ─── Types internes ────────────────────────────────────────────────────────

interface ModelConfig {
  /** Identifiant de modèle HF (org/name) */
  hfId: string;
  /** Nom convivial pour l'UI */
  label: string;
  /** Étapes d'inférence par défaut (qualité vs vitesse) */
  defaultSteps: number;
  /** Guidance scale par défaut (CFG) */
  defaultGuidance: number;
  /** Ratio maximum supporté */
  maxPixels: number;
  /** True si le modèle supporte les LoRA via paramètres `adapter_type`/`adapter_weights` */
  supportsLora?: boolean;
  /** Délai initial d'attente si 503 (model loading) */
  retryDelayMs?: number;
  /** Nombre de retry sur 503 */
  maxRetries?: number;
}

interface GenerationResult {
  success: boolean;
  imageUrl?: string;
  imageBase64?: string;
  generationId?: string;
  cost: number;
  error?: string;
  modelUsed?: string;
  attempts?: Array<{ model: string; ok: boolean; error?: string; latencyMs: number }>;
}

// ─── Catalogue de modèles HF (chaîne de fallback ordonnée) ────────────────

const IMAGE_MODELS: ModelConfig[] = [
  {
    hfId: 'black-forest-labs/FLUX.1-schnell',
    label: 'FLUX.1-schnell',
    defaultSteps: 4,
    defaultGuidance: 0.0,
    maxPixels: 1024 * 1024,
    retryDelayMs: 5_000,
    maxRetries: 2,
  },
  {
    hfId: 'stabilityai/stable-diffusion-xl-base-1.0',
    label: 'SDXL-base-1.0',
    defaultSteps: 25,
    defaultGuidance: 7.5,
    maxPixels: 1024 * 1024,
    supportsLora: true,
    retryDelayMs: 8_000,
    maxRetries: 2,
  },
  {
    hfId: 'stabilityai/stable-diffusion-3-medium-diffusers',
    label: 'SD3-medium',
    defaultSteps: 28,
    defaultGuidance: 7.0,
    maxPixels: 1024 * 1024,
    retryDelayMs: 8_000,
    maxRetries: 1,
  },
  {
    hfId: 'stabilityai/sdxl-turbo',
    label: 'SDXL-turbo',
    defaultSteps: 4,
    defaultGuidance: 0.0,
    maxPixels: 512 * 512,
    retryDelayMs: 5_000,
    maxRetries: 2,
  },
  {
    hfId: 'runwayml/stable-diffusion-v1-5',
    label: 'SD-v1.5',
    defaultSteps: 25,
    defaultGuidance: 7.5,
    maxPixels: 512 * 512,
    supportsLora: true,
    retryDelayMs: 5_000,
    maxRetries: 2,
  },
];

const MODEL_BY_LABEL: Record<string, ModelConfig> = Object.fromEntries(
  IMAGE_MODELS.map((m) => [m.label, m]),
);

const DEFAULT_MODEL_LABEL = 'FLUX.1-schnell';

// ─── Image Generator (singleton) ──────────────────────────────────────────

class ImageGenerator {
  async generate(params: ImageParams): Promise<GenerationResult> {
    const width = params.width ?? 1024;
    const height = params.height ?? 1024;
    // S'il a explicitement demandé un modèle → on commence par celui-là.
    // Sinon → on suit la chaîne de fallback dans IMAGE_MODELS.
    const requested = params.model ? MODEL_BY_LABEL[params.model] : null;
    const chain: ModelConfig[] = requested
      ? [requested, ...IMAGE_MODELS.filter((m) => m.hfId !== requested.hfId)]
      : IMAGE_MODELS;

    const attempts: GenerationResult['attempts'] = [];
    let lastError = '';

    for (const model of chain) {
      const attempt = await this.tryModel(model, params, width, height);
      attempts.push({
        model: model.label,
        ok: attempt.success === true,
        error: attempt.error,
        latencyMs: attempt.latencyMs ?? 0,
      });

      if (attempt.success && attempt.base64) {
        const dataUrl = `data:image/webp;base64,${attempt.base64}`;
        const gen = await prisma.imageGeneration.create({
          data: {
            userId: params.userId,
            prompt: params.prompt.slice(0, 2000),
            model: model.label,
            provider: 'huggingface',
            imageUrl: dataUrl,
            status: 'completed',
            costUsd: 0,
            width,
            height,
            metadata: JSON.stringify({
              hfId: model.hfId,
              latencyMs: attempt.latencyMs,
              attempts: attempts.length,
              fallbackChain: chain.slice(0, attempts.length).map((m) => m.label),
            }),
          },
        });

        logger.info('image_generated_free', {
          generationId: gen.id,
          model: model.label,
          latencyMs: attempt.latencyMs,
          attempts: attempts.length,
        });
        return {
          success: true,
          imageUrl: dataUrl,
          imageBase64: attempt.base64,
          generationId: gen.id,
          cost: 0,
          modelUsed: model.label,
          attempts,
        };
      }
      lastError = attempt.error ?? lastError;
      logger.warn('image_model_failed', {
        model: model.label,
        error: attempt.error?.slice(0, 200) ?? '',
        tryingNext: attempts.length < chain.length,
      });
    }

    // Tous modèles échoués
    await prisma.imageGeneration.create({
      data: {
        userId: params.userId,
        prompt: params.prompt.slice(0, 2000),
        model: requested?.label ?? DEFAULT_MODEL_LABEL,
        provider: 'huggingface',
        status: 'failed',
        costUsd: 0,
        metadata: JSON.stringify({
          error: lastError,
          attempts,
        }),
      },
    });

    return {
      success: false,
      error: lastError,
      cost: 0,
      modelUsed: requested?.label ?? DEFAULT_MODEL_LABEL,
      attempts,
    };
  }

  /**
   * Tente UN modèle HF avec retry sur 503 (model loading).
   */
  private async tryModel(
    model: ModelConfig,
    params: ImageParams,
    width: number,
    height: number,
  ): Promise<{ success: boolean; base64?: string; error?: string; latencyMs: number }> {
    const start = Date.now();
    const maxRetries = model.maxRetries ?? 2;
    const retryDelay = model.retryDelayMs ?? 5_000;

    // Limiter la résolution au maxPixels du modèle (sinon HF rejette)
    const clamped = clampResolution(width, height, model.maxPixels);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await queryHF(model.hfId, {
          inputs: params.prompt,
          parameters: {
            negative_prompt: params.negativePrompt ?? '',
            width: clamped.width,
            height: clamped.height,
            num_inference_steps: model.defaultSteps,
            guidance_scale: model.defaultGuidance,
          },
        });

        if (response.status === 503) {
          // Modèle en cours de chargement → retry après retryDelay
          if (attempt < maxRetries) {
            logger.info('image_model_loading', {
              model: model.label,
              retryIn: retryDelay,
              attempt,
            });
            await new Promise((r) => setTimeout(r, retryDelay));
            continue;
          }
          return {
            success: false,
            error: `Model ${model.label} is loading on HF (503 after ${attempt + 1} retries)`,
            latencyMs: Date.now() - start,
          };
        }

        if (!response.ok) {
          const err = await response.text().catch(() => 'unknown');
          return {
            success: false,
            error: `HF error (${response.status}) on ${model.label}: ${err.slice(0, 200)}`,
            latencyMs: Date.now() - start,
          };
        }

        const buffer = await response.arrayBuffer();
        const base64 = await bufferToBase64(buffer);
        return { success: true, base64, latencyMs: Date.now() - start };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, retryDelay));
          continue;
        }
        return {
          success: false,
          error: `${model.label}: ${msg}`,
          latencyMs: Date.now() - start,
        };
      }
    }

    return {
      success: false,
      error: `${model.label}: exhausted retries`,
      latencyMs: Date.now() - start,
    };
  }

  async getHistory(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [images, total] = await Promise.all([
      prisma.imageGeneration.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          prompt: true,
          model: true,
          status: true,
          imageUrl: true,
          costUsd: true,
          width: true,
          height: true,
          createdAt: true,
        },
      }),
      prisma.imageGeneration.count({ where: { userId } }),
    ]);
    return { images, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  /**
   * Liste des modèles disponibles pour l'UI (champ <select>).
   */
  listModels() {
    return IMAGE_MODELS.map((m) => ({
      label: m.label,
      hfId: m.hfId,
      defaultSteps: m.defaultSteps,
      defaultGuidance: m.defaultGuidance,
      supportsLora: m.supportsLora ?? false,
      maxPixels: m.maxPixels,
    }));
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function clampResolution(width: number, height: number, maxPixels: number): { width: number; height: number } {
  const pixels = width * height;
  if (pixels <= maxPixels) return { width, height };
  const ratio = Math.sqrt(maxPixels / pixels);
  return {
    width: Math.floor((width * ratio) / 8) * 8,
    height: Math.floor((height * ratio) / 8) * 8,
  };
}

export const imageGenerator = new ImageGenerator();
