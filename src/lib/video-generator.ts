/**
 * Video Generation Engine — Generate videos via CogVideo, VideoCrafter, or cloud API
 *
 * Fallback chain: CogVideo (local) → VideoCrafter (local) → Cloud API → z-ai-sdk
 */

import { db } from '@/lib/db';
import { checkRateLimit } from '@/lib/security';
import { createLogger } from '@/lib/logger';

const log = createLogger('video-generator');

// ── Types ─────────────────────────────────────────────────────

interface GenerateVideoOptions {
  model?: string;
  mode?: 't2v' | 'i2v';
  width?: number;
  height?: number;
  fps?: number;
  numFrames?: number;
  numInferenceSteps?: number;
  guidanceScale?: number;
  seed?: number;
}

interface VideoGenerationResult {
  id: string;
  videoUrl: string | null;
  status: string;
  model: string;
  provider: string;
  costUsd: number;
  durationSeconds: number;
  metadata: Record<string, unknown>;
}

// ── Constants ─────────────────────────────────────────────────

const MAX_PROMPT_LENGTH = 2000;
const MAX_VIDEOS_PER_HOUR = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

const VIDEO_API_URL = process.env.VIDEO_API_URL || 'http://localhost:8189';

const AVAILABLE_MODELS: Record<string, { id: string; name: string; provider: string; resolution: string; maxFrames: number; fps: number }> = {
  'cogvideo-2b': {
    id: 'cogvideo',
    name: 'CogVideoX-2B',
    provider: 'local',
    resolution: '720x480',
    maxFrames: 49,
    fps: 8,
  },
  'videocrafter2': {
    id: 'videocrafter',
    name: 'VideoCrafter2',
    provider: 'local',
    resolution: '512x320',
    maxFrames: 16,
    fps: 28,
  },
};

const DEFAULT_MODEL = 'cogvideo-2b';

// ── Input Validation ──────────────────────────────────────────

function sanitizePrompt(prompt: string): string {
  let sanitized = prompt.replace(/<[^>]*>/g, '');
  sanitized = sanitized.replace(/\0/g, '');
  sanitized = sanitized.trim();
  if (sanitized.length > MAX_PROMPT_LENGTH) {
    sanitized = sanitized.substring(0, MAX_PROMPT_LENGTH);
  }
  return sanitized;
}

// ── Rate Limiting ─────────────────────────────────────────────

async function checkVideoRateLimit(userId: string): Promise<{ allowed: boolean; remaining: number }> {
  const rateLimitResult = checkRateLimit(
    `video_gen:${userId}`,
    MAX_VIDEOS_PER_HOUR,
    RATE_LIMIT_WINDOW_MS,
  );

  const oneHourAgo = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const recentGenerations = await db.videoGeneration.count({
    where: { userId, createdAt: { gte: oneHourAgo } },
  });

  if (recentGenerations >= MAX_VIDEOS_PER_HOUR) {
    return { allowed: false, remaining: 0 };
  }

  return {
    allowed: rateLimitResult.allowed,
    remaining: Math.max(0, MAX_VIDEOS_PER_HOUR - recentGenerations - 1),
  };
}

// ── Local Video API ────────────────────────────────────────────

async function generateWithLocalAPI(
  prompt: string,
  model: string,
  options: GenerateVideoOptions,
): Promise<{ videoUrl: string | null; provider: string; durationSeconds: number; metadata: Record<string, unknown> }> {
  const modelInfo = AVAILABLE_MODELS[model] || AVAILABLE_MODELS[DEFAULT_MODEL];

  log.info('Calling local video API', { model: modelInfo.id, prompt: prompt.substring(0, 50) });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300_000);

  try {
    const submitResponse = await fetch(`${VIDEO_API_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        mode: options.mode || 't2v',
        model: modelInfo.id,
        num_frames: options.numFrames || modelInfo.maxFrames,
        width: options.width || parseInt(modelInfo.resolution.split('x')[0]),
        height: options.height || parseInt(modelInfo.resolution.split('x')[1]),
        fps: options.fps || modelInfo.fps,
        num_inference_steps: options.numInferenceSteps || 50,
        guidance_scale: options.guidanceScale || 6.0,
        seed: options.seed ?? -1,
      }),
      signal: controller.signal,
    });

    if (!submitResponse.ok) {
      const errorBody = await submitResponse.text().catch(() => 'Unknown error');
      throw new Error(`Local Video API submit error (${submitResponse.status}): ${errorBody}`);
    }

    const submitData = await submitResponse.json();
    const jobId = submitData.job_id;
    if (!jobId) throw new Error('No job_id returned from Video API');

    log.info('Video generation job submitted', { jobId });

    let attempts = 0;
    const maxPollAttempts = 120;

    while (attempts < maxPollAttempts) {
      await new Promise((r) => setTimeout(r, 2500));

      const statusResponse = await fetch(`${VIDEO_API_URL}/status/${jobId}`, {
        signal: controller.signal,
      });

      if (!statusResponse.ok) {
        throw new Error(`Video API status check failed: ${statusResponse.status}`);
      }

      const statusData = await statusResponse.json();

      if (statusData.status === 'completed') {
        const videoUrl = statusData.video_url
          ? `${VIDEO_API_URL}${statusData.video_url}`
          : null;
        return {
          videoUrl,
          provider: statusData.metadata?.mock ? 'local-mock' : (statusData.metadata?.model || modelInfo.provider),
          durationSeconds: statusData.duration_seconds || 0,
          metadata: statusData.metadata || {},
        };
      }

      if (statusData.status === 'failed') {
        throw new Error(`Video generation failed: ${statusData.error || 'Unknown error'}`);
      }

      attempts++;
    }

    throw new Error('Video generation timed out (polling exceeded max attempts)');
  } finally {
    clearTimeout(timeout);
  }
}

// ── Cloud Video API ────────────────────────────────────────────

async function generateWithCloudAPI(
  prompt: string,
  options: GenerateVideoOptions,
): Promise<{ videoUrl: string | null; provider: string; durationSeconds: number; metadata: Record<string, unknown> }> {
  const apiKey = process.env.REPLICATE_API_TOKEN;
  if (!apiKey) throw new Error('No cloud video API configured');

  log.info('Calling cloud video API (Replicate)');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 600_000);

  try {
    const createResponse = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: 'anotherjesse/cogvideox-2b',
        input: {
          prompt,
          num_frames: options.numFrames || 49,
          num_inference_steps: options.numInferenceSteps || 50,
          guidance_scale: options.guidanceScale || 6.0,
        },
      }),
      signal: controller.signal,
    });

    if (!createResponse.ok) {
      throw new Error(`Replicate API error: ${createResponse.status}`);
    }

    const prediction = await createResponse.json();
    const predictionId = prediction.id;

    let result = prediction;
    let attempts = 0;
    while (result.status !== 'succeeded' && result.status !== 'failed' && attempts < 120) {
      await new Promise((r) => setTimeout(r, 5000));
      const pollResponse = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        headers: { Authorization: `Token ${apiKey}` },
        signal: controller.signal,
      });
      result = await pollResponse.json();
      attempts++;
    }

    if (result.status === 'failed') {
      throw new Error(`Replicate prediction failed: ${result.error || 'Unknown error'}`);
    }

    return {
      videoUrl: result.output?.[0] || null,
      provider: 'replicate',
      durationSeconds: attempts * 5,
      metadata: { predictionId, model: 'cogvideox-2b', status: result.status },
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ── Health Check ──────────────────────────────────────────────

async function checkLocalVideoAPI(): Promise<boolean> {
  try {
    const response = await fetch(`${VIDEO_API_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ── z-ai-sdk Fallback ─────────────────────────────────────────

async function generateWithSDKFallback(
  prompt: string,
  model: string,
  options: GenerateVideoOptions,
): Promise<{ videoUrl: string | null; provider: string; durationSeconds: number; metadata: Record<string, unknown> }> {
  const { default: ZAI } = await import('z-ai-web-dev-sdk');
  const client = await ZAI.create();
  const modelInfo = AVAILABLE_MODELS[model] || AVAILABLE_MODELS[DEFAULT_MODEL];

  const result = await client.video.generations.create({
    model: modelInfo.id,
    prompt,
    mode: options.mode || 't2v',
  });

  return {
    videoUrl: result.url || null,
    provider: 'z-ai-sdk',
    durationSeconds: 0,
    metadata: { model: modelInfo.id, provider: 'z-ai-sdk' },
  };
}

// ── Main Export: generateVideo ────────────────────────────────

export async function generateVideo(
  userId: string,
  prompt: string,
  options: GenerateVideoOptions = {},
): Promise<VideoGenerationResult> {
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    throw new Error('Prompt is required');
  }

  const sanitizedPrompt = sanitizePrompt(prompt);
  if (sanitizedPrompt.length === 0) throw new Error('Prompt is empty after sanitization');

  const model = options.model || DEFAULT_MODEL;
  if (!AVAILABLE_MODELS[model]) {
    throw new Error(`Invalid model. Available: ${Object.keys(AVAILABLE_MODELS).join(', ')}`);
  }

  const rateCheck = await checkVideoRateLimit(userId);
  if (!rateCheck.allowed) {
    throw new Error(`Rate limit exceeded. Maximum ${MAX_VIDEOS_PER_HOUR} videos per hour.`);
  }

  const generation = await db.videoGeneration.create({
    data: {
      userId,
      prompt: sanitizedPrompt,
      mode: options.mode || 't2v',
      model,
      provider: 'pending',
      status: 'pending',
      width: options.width,
      height: options.height,
      fps: options.fps || AVAILABLE_MODELS[model].fps,
      numFrames: options.numFrames,
      metadata: JSON.stringify({ requestedAt: new Date().toISOString() }),
    },
  });

  try {
    let result: { videoUrl: string | null; provider: string; durationSeconds: number; metadata: Record<string, unknown> };
    let usedProvider = 'z-ai-sdk';

    const localAPIHealthy = await checkLocalVideoAPI();

    if (localAPIHealthy) {
      try {
        result = await generateWithLocalAPI(sanitizedPrompt, model, options);
        usedProvider = result.provider;
      } catch (localError) {
        log.warn('Local video API failed, trying cloud', {
          error: localError instanceof Error ? localError.message : String(localError),
        });

        try {
          result = await generateWithCloudAPI(sanitizedPrompt, options);
          usedProvider = result.provider;
        } catch (cloudError) {
          log.warn('Cloud video API failed, falling back to z-ai-sdk', {
            error: cloudError instanceof Error ? cloudError.message : String(cloudError),
          });
          result = await generateWithSDKFallback(sanitizedPrompt, model, options);
          usedProvider = result.provider;
        }
      }
    } else {
      try {
        result = await generateWithCloudAPI(sanitizedPrompt, options);
        usedProvider = result.provider;
      } catch (cloudError) {
        log.warn('Cloud video API failed, falling back to z-ai-sdk', {
          error: cloudError instanceof Error ? cloudError.message : String(cloudError),
        });
        result = await generateWithSDKFallback(sanitizedPrompt, model, options);
        usedProvider = result.provider;
      }
    }

    const updated = await db.videoGeneration.update({
      where: { id: generation.id },
      data: {
        videoUrl: result.videoUrl,
        status: 'completed',
        provider: usedProvider,
        durationSeconds: result.durationSeconds,
        metadata: JSON.stringify(result.metadata),
      },
    });

    await db.aICost.create({
      data: {
        userId,
        provider: usedProvider,
        model,
        costUsd: 0,
        requestId: generation.id,
      },
    });

    log.info('Video generated', {
      userId,
      generationId: generation.id,
      provider: usedProvider,
      durationSeconds: result.durationSeconds,
    });

    return {
      id: updated.id,
      videoUrl: updated.videoUrl,
      status: updated.status,
      model: updated.model,
      provider: updated.provider,
      costUsd: 0,
      durationSeconds: updated.durationSeconds || 0,
      metadata: JSON.parse(updated.metadata || '{}'),
    };
  } catch (error) {
    await db.videoGeneration.update({
      where: { id: generation.id },
      data: {
        status: 'failed',
        metadata: JSON.stringify({
          error: error instanceof Error ? error.message : 'Unknown error',
          failedAt: new Date().toISOString(),
        }),
      },
    });
    throw error;
  }
}

// ── Helper: getUserVideos ─────────────────────────────────────

export async function getUserVideos(
  userId: string,
  options: { limit?: number; offset?: number; status?: string } = {}
) {
  const limit = Math.min(Math.max(options.limit || 20, 1), 100);
  const offset = Math.max(options.offset || 0, 0);

  const where: Record<string, unknown> = { userId };
  if (options.status) where.status = options.status;

  const [videos, total] = await Promise.all([
    db.videoGeneration.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    db.videoGeneration.count({ where }),
  ]);

  return { videos, total, limit, offset };
}

// ── Helper: getVideoGeneration ────────────────────────────────

export async function getVideoGeneration(
  id: string,
  userId: string
): Promise<VideoGenerationResult | null> {
  const video = await db.videoGeneration.findUnique({ where: { id } });

  if (!video || video.userId !== userId) return null;

  return {
    id: video.id,
    videoUrl: video.videoUrl,
    status: video.status,
    model: video.model,
    provider: video.provider,
    costUsd: 0,
    durationSeconds: video.durationSeconds || 0,
    metadata: JSON.parse(video.metadata || '{}'),
  };
}
