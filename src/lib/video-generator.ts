// ============================================================
// VIDEO GENERATOR — Génération de vidéos via Hugging Face (gratuit)
// ============================================================

import { prisma } from "./prisma";
import { logger } from "./logger";
import { queryHF, bufferToBase64 } from "./huggingface";

interface VideoParams {
  userId: string;
  prompt: string;
  model?: string;
  negativePrompt?: string;
  numFrames?: number;
  width?: number;
  height?: number;
}

class VideoGenerator {
  async generate(params: VideoParams) {
    try {
      const response = await queryHF("Lightricks/LTX-Video", {
        inputs: params.prompt,
        parameters: {
          negative_prompt: params.negativePrompt ?? "",
          num_frames: params.numFrames ?? 25,
          width: params.width ?? 640,
          height: params.height ?? 480,
          num_inference_steps: 25,
        },
      });

      if (!response.ok) {
        const err = await response.text();
        if (response.status === 503) {
          return { success: false, error: "Le modèle vidéo se charge, veuillez réessayer dans 30s...", cost: 0 };
        }
        throw new Error(`HF video error (${response.status}): ${err.slice(0, 200)}`);
      }

      const buffer = await response.arrayBuffer();
      const base64 = await bufferToBase64(buffer);
      const dataUrl = `data:video/mp4;base64,${base64}`;

      const gen = await prisma.videoGeneration.create({
        data: {
          userId: params.userId,
          prompt: params.prompt.slice(0, 2000),
          mode: "t2v",
          model: "Lightricks/LTX-Video",
          provider: "huggingface",
          videoUrl: dataUrl,
          status: "completed",
          costUsd: 0,
          width: params.width ?? 640,
          height: params.height ?? 480,
          fps: 8,
          numFrames: params.numFrames ?? 25,
          durationSeconds: (params.numFrames ?? 25) / 8,
        },
      });

      logger.info("video_generated_free", { generationId: gen.id });
      return { success: true, videoUrl: dataUrl, videoBase64: base64, generationId: gen.id, cost: 0 };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await prisma.videoGeneration.create({
        data: {
          userId: params.userId,
          prompt: params.prompt.slice(0, 2000),
          mode: "t2v",
          model: "Lightricks/LTX-Video",
          provider: "huggingface",
          status: "failed",
          costUsd: 0,
          metadata: JSON.stringify({ error: msg }),
        },
      });
      logger.error("video_generation_failed", { error: msg });
      return { success: false, error: msg, cost: 0 };
    }
  }

  async getHistory(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [videos, total] = await Promise.all([
      prisma.videoGeneration.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true, prompt: true, model: true, status: true,
          videoUrl: true, costUsd: true, durationSeconds: true,
          width: true, height: true, createdAt: true,
        },
      }),
      prisma.videoGeneration.count({ where: { userId } }),
    ]);
    return { videos, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }
}

export const videoGenerator = new VideoGenerator();