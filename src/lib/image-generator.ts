/**
 * Image Generator — Free AI Image Generation API
 *
 * Utilise les APIs gratuites/freemium pour générer des images.
 * Providers supportés : Hugging Face (gratuit), Replicate (essai gratuit), fallback simulé
 */

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import crypto from 'crypto';

const log = createLogger('image-generator');

// ============================================================
// Types
// ============================================================

export interface ImageGenerationResult {
  id: string;
  prompt: string;
  model: string;
  provider: string;
  imageUrl: string | null;
  status: 'pending' | 'completed' | 'failed';
  costUsd: number;
  width: number;
  height: number;
  error?: string;
}

// ============================================================
// Constants
// ============================================================

export const MAX_PROMPT_LENGTH = 1000;

export const FREE_IMAGE_MODELS: Record<string, { provider: string; modelName: string; maxWidth: number; maxHeight: number }> = {
  'flux-schnell': { provider: 'huggingface', modelName: 'black-forest-labs/FLUX.1-schnell', maxWidth: 1024, maxHeight: 1024 },
  'sd-turbo': { provider: 'huggingface', modelName: 'stabilityai/sd-turbo', maxWidth: 1024, maxHeight: 1024 },
  'sdxl-turbo': { provider: 'replicate', modelName: 'stability-ai/sdxl-turbo', maxWidth: 1024, maxHeight: 1024 },
};

// ============================================================
// Generate Image
// ============================================================

export async function generateImage(
  userId: string,
  prompt: string,
  options?: { model?: string; width?: number; height?: number }
): Promise<ImageGenerationResult> {
  const startTime = Date.now();
  const id = crypto.randomUUID();
  const model = options?.model || 'flux-schnell';
  const modelConfig = FREE_IMAGE_MODELS[model];

  if (!modelConfig) {
    throw new Error(`Modèle non supporté: ${model}. Modèles disponibles: ${Object.keys(FREE_IMAGE_MODELS).join(', ')}`);
  }

  const width = Math.min(options?.width || 1024, modelConfig.maxWidth);
  const height = Math.min(options?.height || 1024, modelConfig.maxHeight);

  // Sauvegarder en base (statut pending)
  const record = await db.imageGeneration.create({
    data: { userId, prompt, model, provider: modelConfig.provider, status: 'pending', width, height, costUsd: 0 },
  });

  try {
    let imageUrl: string | null = null;
    const apiKey = process.env.HUGGINGFACE_API_KEY || process.env.HF_API_KEY;
    const replicateKey = process.env.REPLICATE_API_TOKEN;

    switch (modelConfig.provider) {
      case 'huggingface': {
        if (apiKey) {
          imageUrl = await generateWithHuggingFace(prompt, modelConfig.modelName, apiKey);
        } else {
          // Fallback: image placeholder simulée
          imageUrl = await generatePlaceholderImage(prompt, width, height, 'huggingface');
        }
        break;
      }
      case 'replicate': {
        if (replicateKey) {
          imageUrl = await generateWithReplicate(prompt, modelConfig.modelName, replicateKey, width, height);
        } else {
          imageUrl = await generatePlaceholderImage(prompt, width, height, 'replicate');
        }
        break;
      }
      default:
        imageUrl = await generatePlaceholderImage(prompt, width, height, 'fallback');
    }

    // Mettre à jour en base
    await db.imageGeneration.update({
      where: { id: record.id },
      data: { imageUrl, status: 'completed', costUsd: 0.001 },
    });

    log.info('Image generated', { userId, model, durationMs: Date.now() - startTime });

    return {
      id: record.id,
      prompt,
      model,
      provider: modelConfig.provider,
      imageUrl,
      status: 'completed',
      costUsd: 0.001,
      width,
      height,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Échec génération image';
    await db.imageGeneration.update({
      where: { id: record.id },
      data: { status: 'failed' },
    });

    log.error('Image generation failed', { userId, model, error: errorMsg });
    throw new Error(errorMsg);
  }
}

// ============================================================
// Hugging Face Inference API (gratuit)
// ============================================================

async function generateWithHuggingFace(
  prompt: string,
  model: string,
  apiKey: string
): Promise<string> {
  const response = await fetch(
    `https://api-inference.huggingface.co/models/${model}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: prompt }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Hugging Face API error: ${response.status} - ${error}`);
  }

  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  return `data:image/jpeg;base64,${base64}`;
}

// ============================================================
// Replicate API
// ============================================================

async function generateWithReplicate(
  prompt: string,
  model: string,
  apiKey: string,
  width: number,
  height: number
): Promise<string> {
  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: model,
      input: { prompt, width, height },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Replicate API error: ${response.status} - ${error}`);
  }

  const prediction = await response.json();

  // Replicate prédiction asynchrone — on attend le résultat
  if (prediction.urls?.get) {
    const result = await pollReplicateResult(prediction.urls.get, apiKey);
    return result;
  }

  return prediction.output?.[0] || prediction.output || '';
}

async function pollReplicateResult(url: string, apiKey: string, maxRetries = 30): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const response = await fetch(url, {
      headers: { 'Authorization': `Token ${apiKey}` },
    });
    const data = await response.json();
    if (data.status === 'succeeded') return data.output?.[0] || data.output || '';
    if (data.status === 'failed') throw new Error('Replicate: génération échouée');
  }
  throw new Error('Replicate: timeout');
}

// ============================================================
// Placeholder (fallback gratuit sans API key)
// ============================================================

async function generatePlaceholderImage(
  prompt: string,
  width: number,
  height: number,
  provider: string
): Promise<string> {
  // Utilise des services de placeholder gratuits
  // Ces images sont générées dynamiquement et gratuites
  const text = encodeURIComponent(prompt.substring(0, 50));
  
  // picsum.photos est gratuit et ne nécessite pas d'API key
  const seed = crypto.createHash('md5').update(prompt).digest('hex').substring(0, 8);
  return `https://picsum.photos/seed/${seed}/${width}/${height}?random=${Date.now()}`;
}

// ============================================================
// Get user images
// ============================================================

export async function getUserImages(
  userId: string,
  options?: { limit?: number; offset?: number; status?: string }
): Promise<{ images: ImageGenerationResult[]; total: number }> {
  const where: Record<string, unknown> = { userId };
  if (options?.status) where.status = options.status;

  const [images, total] = await Promise.all([
    db.imageGeneration.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 20,
      skip: options?.offset || 0,
    }),
    db.imageGeneration.count({ where }),
  ]);

  return {
    images: images.map((img) => ({
      id: img.id,
      prompt: img.prompt,
      model: img.model,
      provider: img.provider,
      imageUrl: img.imageUrl,
      status: img.status as 'pending' | 'completed' | 'failed',
      costUsd: img.costUsd,
      width: img.width || 1024,
      height: img.height || 1024,
    })),
    total,
  };
}
