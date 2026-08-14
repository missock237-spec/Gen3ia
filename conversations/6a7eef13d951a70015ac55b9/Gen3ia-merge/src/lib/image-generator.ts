// ============================================================
// IMAGE GENERATOR — Génération d'images via Hugging Face (gratuit)
// ============================================================

import { prisma } from "./prisma";
import { logger } from "./logger";
import { queryHF, bufferToBase64 } from "./huggingface";

interface ImageParams {
  userId: string;
  prompt: string;
  model?: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
}

class ImageGenerator {
  async generate(params: ImageParams) {
    const modelId = params.model ?? "flux-schnell";

    try {
      const response = await queryHF(
        `black-forest-labs/FLUX.1-schnell`,
        {
          inputs: params.prompt,
          parameters: {
            negative_prompt: params.negativePrompt ?? "",
            width: params.width ?? 1024,
            height: params.height ?? 1024,
            num_inference_steps: 4,
            guidance_scale: 0.0,
          },
        },
      );

      if (!response.ok) {
        const err = await response.text();
        if (response.status === 503) {
          return { success: false, error: "Le modèle se charge, veuillez réessayer dans 30s...", cost: 0 };
        }
        throw new Error(`HF error (${response.status}): ${err.slice(0, 200)}`);
      }

      const buffer = await response.arrayBuffer();
      const base64 = await bufferToBase64(buffer);
      const dataUrl = `data:image/webp;base64,${base64}`;

      const gen = await prisma.imageGeneration.create({
        data: {
          userId: params.userId,
          prompt: params.prompt.slice(0, 2000),
          model: modelId,
          provider: "huggingface",
          imageUrl: dataUrl,
          status: "completed",
          costUsd: 0,
          width: params.width ?? 1024,
          height: params.height ?? 1024,
        },
      });

      logger.info("image_generated_free", { generationId: gen.id, model: modelId });
      return { success: true, imageUrl: dataUrl, imageBase64: base64, generationId: gen.id, cost: 0 };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await prisma.imageGeneration.create({
        data: {
          userId: params.userId,
          prompt: params.prompt.slice(0, 2000),
          model: modelId,
          provider: "huggingface",
          status: "failed",
          costUsd: 0,
          metadata: JSON.stringify({ error: msg }),
        },
      });
      logger.error("image_generation_failed", { error: msg });
      return { success: false, error: msg, cost: 0 };
    }
  }

  async getHistory(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [images, total] = await Promise.all([
      prisma.imageGeneration.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true, prompt: true, model: true, status: true,
          imageUrl: true, costUsd: true, width: true, height: true, createdAt: true,
        },
      }),
      prisma.imageGeneration.count({ where: { userId } }),
    ]);
    return { images, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }
}

export const imageGenerator = new ImageGenerator();