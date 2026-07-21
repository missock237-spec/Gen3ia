// ============================================================
// HUGGING FACE — Génération d'images (Text-to-Image)
// ============================================================
// Modèles : FLUX.1-dev, Stable Diffusion XL, SD 3.5
// ============================================================

import { prisma } from "./prisma";
import { logger } from "./logger";

const HF_API_BASE = "https://api-inference.huggingface.co/models";
const HF_TOKEN = process.env.HUGGINGFACE_API_KEY ?? "";

function getHeaders() {
  return { Authorization: `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" };
}

export interface ImageGenerationParams {
  userId: string;
  prompt: string;
  model?: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
}

const MODELS: Record<string, { model: string; cost: number }> = {
  "flux-dev": { model: "black-forest-labs/FLUX.1-dev", cost: 0.04 },
  "sdxl": { model: "stabilityai/stable-diffusion-xl-base-1.0", cost: 0.02 },
  "sd-3.5": { model: "stabilityai/stable-diffusion-3.5-large", cost: 0.03 },
};

class ImageGenerator {
  async generate(params: ImageGenerationParams) {
    const cfg = MODELS[params.model ?? "flux-dev"] ?? MODELS["flux-dev"];
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
            width: params.width ?? 1024,
            height: params.height ?? 1024,
            num_inference_steps: 28,
            guidance_scale: 7.5,
          },
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`HF error (${response.status}): ${err.slice(0, 200)}`);
      }

      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const binary = Array.from(bytes).map((b) => String.fromCharCode(b)).join("");
      const base64 = btoa(binary);
      const dataUrl = `data:image/png;base64,${base64}`;
      const cost = cfg.cost;
      const charge = Math.max(1, Math.ceil(cost * 100));

      const gen = await prisma.imageGeneration.create({
        data: {
          userId: params.userId, prompt: params.prompt.slice(0, 2000),
          model: cfg.model, provider: "huggingface",
          imageUrl: dataUrl, status: "completed", costUsd: cost,
          width: params.width ?? 1024, height: params.height ?? 1024,
        },
      });

      await prisma.user.update({ where: { id: params.userId }, data: { credits: { decrement: charge } } });
      await prisma.creditTransaction.create({
        data: { userId: params.userId, amount: -charge, balance: (user.credits ?? 0) - charge, type: "usage", resourceType: "image_generation", resourceId: gen.id, description: `Image: ${params.prompt.slice(0, 100)}` },
      });

      logger.info("image_generated", { generationId: gen.id, model: cfg.model, cost });
      return { success: true, imageUrl: dataUrl, imageBase64: base64, generationId: gen.id, cost };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await prisma.imageGeneration.create({
        data: { userId: params.userId, prompt: params.prompt.slice(0, 2000), model: cfg.model, provider: "huggingface", status: "failed", costUsd: 0, metadata: JSON.stringify({ error: msg }) },
      });
      logger.error("image_generation_failed", { error: msg });
      return { success: false, error: msg, cost: 0 };
    }
  }

  async getHistory(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [images, total] = await Promise.all([
      prisma.imageGeneration.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, skip, take: limit, select: { id: true, prompt: true, model: true, status: true, imageUrl: true, costUsd: true, width: true, height: true, createdAt: true } }),
      prisma.imageGeneration.count({ where: { userId } }),
    ]);
    return { images, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }
}

export const imageGenerator = new ImageGenerator();