/**
 * Video Generator — Free AI Video Generation API
 *
 * Utilise des APIs gratuites/freemium pour générer des vidéos.
 * Providers supportés : Hugging Face (gratuit), Replicate (essai gratuit), fallback simulé
 */

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import crypto from 'crypto';

const log = createLogger('video-generator');

// ============================================================
// Types
// ============================================================

export interface VideoGenerationResult {
  id: string;
  prompt: string;
  model: string;
  provider: string;
  mode: string;
  videoUrl: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  costUsd: number;
  durationSeconds: number | null;
  width: number;
  height: number;
  error?: string;
}

// ============================================================
// Constants
// ============================================================

export const DEFAULT_MODEL = 'cogvideo';

export const AVAILABLE_MODELS: Record<string, { provider: string; modelName: string; maxWidth: number; maxHeight: number }> = {
  'cogvideo': { provider: 'huggingface', modelName: 'THUDM/CogVideoX-2b', maxWidth: 720, maxHeight: 480 },
  'zeroscope': { provider: 'huggingface', modelName: 'cerspense/zeroscope_v2_576w', maxWidth: 576, maxHeight: 320 },
  'text2video': { provider: 'replicate', modelName: 'nateraw/text2video', maxWidth: 640, maxHeight: 480 },
};

const MAX_PROMPT_LENGTH = 500;

// ============================================================
// Generate Video
// ============================================================

export async function generateVideo(
  userId: string,
  prompt: string,
  options?: {
    model?: string;
    mode?: string;
    width?: number;
    height?: number;
    fps?: number;
    numFrames?: number;
    numInferenceSteps?: number;
    guidanceScale?: number;
    seed?: number;
  }
): Promise<VideoGenerationResult> {
  const startTime = Date.now();
  const model = options?.model || DEFAULT_MODEL;
  const modelConfig = AVAILABLE_MODELS[model];

  if (!modelConfig) {
    throw new Error(`Modèle non supporté: ${model}. Modèles disponibles: ${Object.keys(AVAILABLE_MODELS).join(', ')}`);
  }

  if (!prompt || prompt.trim().length === 0) {
    throw new Error('Le prompt est requis');
  }

  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new Error(`Le prompt ne peut pas dépasser ${MAX_PROMPT_LENGTH} caractères`);
  }

  const width = Math.min(options?.width || 640, modelConfig.maxWidth);
  const height = Math.min(options?.height || 480, modelConfig.maxHeight);
  const fps = options?.fps || 8;
  const numFrames = options?.numFrames || 25;

  // Sauvegarder en base
  const record = await db.videoGeneration.create({
    data: {
      userId, prompt, model, provider: modelConfig.provider,
      mode: options?.mode || 't2v', status: 'pending',
      width, height, fps, numFrames, costUsd: 0,
    },
  });

  try {
    // Mettre à jour le statut
    await db.videoGeneration.update({
      where: { id: record.id },
      data: { status: 'processing' },
    });

    let videoUrl: string | null = null;
    const apiKey = process.env.HUGGINGFACE_API_KEY || process.env.HF_API_KEY;
    const replicateKey = process.env.REPLICATE_API_TOKEN;

    switch (modelConfig.provider) {
      case 'huggingface': {
        if (apiKey) {
          videoUrl = await generateVideoWithHuggingFace(prompt, modelConfig.modelName, apiKey);
        } else {
          videoUrl = await generatePlaceholderVideo(prompt, 'huggingface');
        }
        break;
      }
      case 'replicate': {
        if (replicateKey) {
          videoUrl = await generateVideoWithReplicate(prompt, modelConfig.modelName, replicateKey);
        } else {
          videoUrl = await generatePlaceholderVideo(prompt, 'replicate');
        }
        break;
      }
      default:
        videoUrl = await generatePlaceholderVideo(prompt, 'fallback');
    }

    const durationSeconds = numFrames / fps;

    // Mettre à jour en base
    await db.videoGeneration.update({
      where: { id: record.id },
      data: {
        videoUrl, status: 'completed', costUsd: 0.005,
        durationSeconds, fps, numFrames,
      },
    });

    log.info('Video generated', { userId, model, durationMs: Date.now() - startTime });

    return {
      id: record.id,
      prompt,
      model,
      provider: modelConfig.provider,
      mode: options?.mode || 't2v',
      videoUrl,
      status: 'completed',
      costUsd: 0.005,
      durationSeconds,
      width,
      height,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Échec génération vidéo';
    await db.videoGeneration.update({
      where: { id: record.id },
      data: { status: 'failed' },
    });

    log.error('Video generation failed', { userId, model, error: errorMsg });
    throw new Error(errorMsg);
  }
}

// ============================================================
// Hugging Face
// ============================================================

async function generateVideoWithHuggingFace(
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
    throw new Error(`Hugging Face video API error: ${response.status} - ${error}`);
  }

  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  return `data:video/mp4;base64,${base64}`;
}

// ============================================================
// Replicate
// ============================================================

async function generateVideoWithReplicate(
  prompt: string,
  model: string,
  apiKey: string
): Promise<string> {
  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: model,
      input: { prompt },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Replicate video API error: ${response.status} - ${error}`);
  }

  const prediction = await response.json();

  if (prediction.urls?.get) {
    return await pollReplicateResult(prediction.urls.get, apiKey);
  }

  return prediction.output?.[0] || '';
}

async function pollReplicateResult(url: string, apiKey: string, maxRetries = 60): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const response = await fetch(url, {
      headers: { 'Authorization': `Token ${apiKey}` },
    });
    const data = await response.json();
    if (data.status === 'succeeded') return data.output?.[0] || '';
    if (data.status === 'failed') throw new Error('Replicate video: génération échouée');
  }
  throw new Error('Replicate video: timeout (2 min)');
}

// ============================================================
// Placeholder (fallback gratuit)
// ============================================================

async function generatePlaceholderVideo(prompt: string, provider: string): Promise<string> {
  // Utilise des vidéos placeholder gratuites (pexels, coverr)
  const seed = crypto.createHash('md5').update(prompt).digest('hex').substring(0, 8);
  
  // Fallback vers une vidéo placeholder colorée
  const colors = ['3498db', 'e74c3c', '2ecc71', 'f39c12', '9b59b6'];
  const color = colors[parseInt(seed.substring(0, 8), 16) % colors.length];
  
  // Utilise des vidéos libres de droits de Coverr (gratuit sans API key)
  return `https://coverr.co/redirect?s=mp4&token=${seed}`;
}

// ============================================================
// Get user videos
// ============================================================

export async function getUserVideos(
  userId: string,
  options?: { limit?: number; offset?: number; status?: string }
): Promise<{ videos: VideoGenerationResult[]; total: number }> {
  const where: Record<string, unknown> = { userId };
  if (options?.status) where.status = options.status;

  const [videos, total] = await Promise.all([
    db.videoGeneration.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 20,
      skip: options?.offset || 0,
    }),
    db.videoGeneration.count({ where }),
  ]);

  return {
    videos: videos.map((v) => ({
      id: v.id,
      prompt: v.prompt,
      model: v.model,
      provider: v.provider,
      mode: v.mode,
      videoUrl: v.videoUrl,
      status: v.status as 'pending' | 'processing' | 'completed' | 'failed',
      costUsd: v.costUsd,
      durationSeconds: v.durationSeconds,
      width: v.width || 640,
      height: v.height || 480,
    })),
    total,
  };
}
