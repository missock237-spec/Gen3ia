// ============================================================
// HUGGING FACE — Génération de vidéos (Text-to-Video)
// ============================================================
// Modèles : LTX-Video, HunyuanVideo
// ============================================================

import { prisma } from "./prisma";
import { logger } from "./logger";

const HF_API_BASE = "https://api-inference.huggingface.co/models";
const HF_TOKEN = process.env.HUGGINGFACE_API_KEY ?? "";

function getHeaders() {
  return { Authorization: `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" };
}

const MODELS: Record<string, { model: string; cost: number }> = {
  "ltx-video": { model: "Lightricks/LTX-Video", cost: 0.08 },
  "hunyuan": { model: "TencentARC/HunyuanVideo", cost: 0.12 },
};

class VideoGenerator {
  async generate(params: { userId: string; prompt: string; model?: string; negativePrompt?: string; numFrames?: number; width?: number; height?: number }) {
    const cfg = MODELS[params.model ?? "ltx-video"] ?? MODELS["ltx-video"];
    const user = await prisma.user.findUnique({ where: { id: params.userId }, select: { credits: true } });
    if (!user || user.credits < 1) return { success: false, error: "Crédits insuffisants", cost: 0 };

    try {
      const response = await fetch(`${HF_API_BASE}/${cfg.model}`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          inputs: params.prompt,
          parameters: {
            negative_prompt: params.negativePrompt ?? "",
            num_frames: params.numFrames ?? 25,
            width: params.width ?? 640,
            height: params.height ?? 480,
            num_inference_steps: 25,
          },
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`HF video error (${response.status}): ${err.slice(0, 200)}`);
      }

      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const binary = Array.from(bytes).map((b) => String.fromCharCode(b)).join("");
      const base64 = btoa(binary);
      const dataUrl = `data:video/mp4;base64,${base64}`;
      const cost = cfg.cost;
      const charge = Math.max(1, Math.ceil(cost * 100));

      const gen = await prisma.videoGeneration.create({
        data: {
          userId: params.userId, prompt: params.prompt.slice(0, 2000),
          mode: "t2v", model: cfg.model, provider: "huggingface",
          videoUrl: dataUrl, status: "completed", costUsd: cost,
          width: params.width ?? 640, height: params.height ?? 480,
          fps: 8, numFrames: params.numFrames ?? 25,
          durationSeconds: (params.numFrames ?? 25) / 8,
        },
      });

      await prisma.user.update({ where: { id: params.userId }, data: { credits: { decrement: charge } } });
      await prisma.creditTransaction.create({
        data: { userId: params.userId, amount: -charge, balance: (user.credits ?? 0) - charge, type: "usage", resourceType: "video_generation", resourceId: gen.id, description: `Video: ${params.prompt.slice(0, 100)}` },
      });

      logger.info("video_generated", { generationId: gen.id, model: cfg.model, cost });
      return { success: true, videoUrl: dataUrl, videoBase64: base64, generationId: gen.id, cost };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await prisma.videoGeneration.create({
        data: { userId: params.userId, prompt: params.prompt.slice(0, 2000), mode: "t2v", model: cfg.model, provider: "huggingface", status: "failed", costUsd: 0, metadata: JSON.stringify({ error: msg }) },
      });
      logger.error("video_generation_failed", { error: msg });
      return { success: false, error: msg, cost: 0 };
    }
  }

  async getHistory(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [videos, total] = await Promise.all([
      prisma.videoGeneration.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, skip, take: limit, select: { id: true, prompt: true, model: true, status: true, videoUrl: true, costUsd: true, durationSeconds: true, width: true, height: true, createdAt: true } }),
      prisma.videoGeneration.count({ where: { userId } }),
    ]);
    return { videos, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }
}

export const videoGenerator = new VideoGenerator();