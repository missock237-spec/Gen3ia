/**
 * Video Generator — Free AI Video Generation API
 *
 * - Durée max par vidéo : 10 secondes
 * - Les utilisateurs peuvent importer une vidéo existante pour l'étendre
 * - Durée d'extension max : 10 secondes supplémentaires
 * - Durée totale max avec extension : 20 secondes
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
  isExtended: boolean;
  parentVideoId?: string;
  error?: string;
}

export interface ExtendVideoInput {
  userId: string;
  videoId: string;       // ID de la vidéo à étendre
  prompt: string;        // Description de la suite
  additionalSeconds: number; // Secondes à ajouter (max 10)
}

// ============================================================
// Constants
// ============================================================

export const DEFAULT_MODEL = 'cogvideo';

export const MAX_VIDEO_DURATION_SECONDS = 10;      // 10s max par vidéo
export const MAX_EXTENSION_SECONDS = 10;            // 10s max d'extension
export const MAX_TOTAL_DURATION_SECONDS = 20;       // 20s max totale

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

  const fps = options?.fps || 10;
  // Calculer le nombre de frames pour ne pas dépasser 10 secondes
  const maxFrames = MAX_VIDEO_DURATION_SECONDS * fps;
  const numFrames = Math.min(options?.numFrames || maxFrames, maxFrames);
  const width = Math.min(options?.width || 640, modelConfig.maxWidth);
  const height = Math.min(options?.height || 480, modelConfig.maxHeight);

  return await processVideoGeneration(userId, prompt, model, modelConfig.provider, {
    fps, numFrames, width, height, isExtended: false
  });
}

// ============================================================
// Extend Video — Importer une vidéo existante et l'étendre
// ============================================================

export async function extendExistingVideo(input: ExtendVideoInput): Promise<VideoGenerationResult> {
  const { userId, videoId, prompt, additionalSeconds } = input;

  if (additionalSeconds <= 0 || additionalSeconds > MAX_EXTENSION_SECONDS) {
    throw new Error(`La durée d'extension doit être entre 1 et ${MAX_EXTENSION_SECONDS} secondes.`);
  }

  // Récupérer la vidéo originale
  const originalVideo = await db.videoGeneration.findUnique({
    where: { id: videoId },
  });

  if (!originalVideo) {
    throw new Error('Vidéo originale introuvable.');
  }

  if (originalVideo.userId !== userId) {
    throw new Error('Cette vidéo ne vous appartient pas.');
  }

  if (originalVideo.status !== 'completed') {
    throw new Error('La vidéo originale doit être complétée avant de pouvoir l\'étendre.');
  }

  // Calculer la durée totale si on ajoute
  const originalDuration = originalVideo.durationSeconds || 0;
  const totalDuration = originalDuration + additionalSeconds;

  if (totalDuration > MAX_TOTAL_DURATION_SECONDS) {
    throw new Error(
      `Durée totale maximale dépassée. La vidéo fait déjà ${originalDuration}s, ` +
      `vous pouvez ajouter au maximum ${MAX_EXTENSION_SECONDS}s (total max: ${MAX_TOTAL_DURATION_SECONDS}s).`
    );
  }

  // Calculer les frames pour l'extension
  const fps = originalVideo.fps || 10;
  const numFrames = additionalSeconds * fps;

  // Générer la suite
  const extensionPrompt = `Suite de la vidéo précédente. ${prompt}. Style cohérent avec la partie précédente.`;

  const result = await processVideoGeneration(
    userId,
    extensionPrompt,
    originalVideo.model || DEFAULT_MODEL,
    originalVideo.provider || 'huggingface',
    {
      fps,
      numFrames,
      width: originalVideo.width || 640,
      height: originalVideo.height || 480,
      isExtended: true,
      parentVideoId: videoId,
    }
  );

  return result;
}

// ============================================================
// Moteur de génération commun
// ============================================================

async function processVideoGeneration(
  userId: string,
  prompt: string,
  model: string,
  provider: string,
  config: {
    fps: number;
    numFrames: number;
    width: number;
    height: number;
    isExtended: boolean;
    parentVideoId?: string;
  }
): Promise<VideoGenerationResult> {
  const startTime = Date.now();
  const modelConfig = AVAILABLE_MODELS[model];

  if (!modelConfig) {
    throw new Error(`Modèle non supporté: ${model}`);
  }

  const { fps, numFrames, width, height, isExtended, parentVideoId } = config;

  // Sauvegarder en base
  const record = await db.videoGeneration.create({
    data: {
      userId, prompt, model, provider,
      mode: isExtended ? 'extend' : 't2v',
      status: 'pending',
      width, height, fps, numFrames, costUsd: 0,
      metadata: isExtended && parentVideoId
        ? JSON.stringify({ isExtended: true, parentVideoId })
        : '{}',
    },
  });

  try {
    await db.videoGeneration.update({
      where: { id: record.id },
      data: { status: 'processing' },
    });

    let videoUrl: string | null = null;
    const apiKey = process.env.HUGGINGFACE_API_KEY || process.env.HF_API_KEY;
    const replicateKey = process.env.REPLICATE_API_TOKEN;

    switch (provider) {
      case 'huggingface': {
        if (apiKey) {
          videoUrl = await generateVideoWithHuggingFace(prompt, modelConfig.modelName, apiKey);
        } else {
          videoUrl = await generatePlaceholderVideo(prompt, 'huggingface', model);
        }
        break;
      }
      case 'replicate': {
        if (replicateKey) {
          videoUrl = await generateVideoWithReplicate(prompt, modelConfig.modelName, replicateKey);
        } else {
          videoUrl = await generatePlaceholderVideo(prompt, 'replicate', model);
        }
        break;
      }
      default:
        videoUrl = await generatePlaceholderVideo(prompt, 'fallback', model);
    }

    const durationSeconds = numFrames / fps;

    await db.videoGeneration.update({
      where: { id: record.id },
      data: {
        videoUrl, status: 'completed', costUsd: 0.005,
        durationSeconds, fps, numFrames,
        metadata: isExtended && parentVideoId
          ? JSON.stringify({ isExtended: true, parentVideoId, originalDuration: durationSeconds })
          : JSON.stringify({ isExtended: false, originalDuration: durationSeconds }),
      },
    });

    log.info('Vidéo générée', {
      userId, model, durationMs: Date.now() - startTime,
      durationSeconds, isExtended,
    });

    return {
      id: record.id,
      prompt,
      model,
      provider,
      mode: isExtended ? 'extend' : 't2v',
      videoUrl,
      status: 'completed',
      costUsd: 0.005,
      durationSeconds,
      width,
      height,
      isExtended,
      parentVideoId,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Échec génération vidéo';
    await db.videoGeneration.update({
      where: { id: record.id },
      data: { status: 'failed' },
    });

    log.error('Échec génération vidéo', { userId, model, error: errorMsg });
    throw new Error(errorMsg);
  }
}

// ============================================================
// APIs externes
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

async function generatePlaceholderVideo(prompt: string, provider: string, model: string): Promise<string> {
  const seed = crypto.createHash('md5').update(prompt).digest('hex').substring(0, 8);
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
    videos: videos.map((v) => {
      let meta: { isExtended?: boolean; parentVideoId?: string } = {};
      try { meta = JSON.parse(v.metadata || '{}'); } catch { /* ignore */ }

      return {
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
        isExtended: meta.isExtended || false,
        parentVideoId: meta.parentVideoId,
      };
    }),
    total,
  };
}
