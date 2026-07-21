// ============================================================
// HUGGING FACE — Génération audio (Text-to-Speech)
// ============================================================
// Modeles : facebook/mms-tts-fra (francais), suno/bark
// ============================================================

import { prisma } from "./prisma";
import { logger } from "./logger";

const HF_API_BASE = "https://api-inference.huggingface.co/models";
const HF_TOKEN = process.env.HUGGINGFACE_API_KEY ?? "";

function getHeaders() {
  return { Authorization: `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" };
}

const MODELS: Record<string, { model: string; cost: number }> = {
  "mms-fra": { model: "facebook/mms-tts-fra", cost: 0.005 },
  "bark": { model: "suno/bark", cost: 0.01 },
};

class AudioGenerator {
  async generate(params: { userId: string; text: string; model?: string; speed?: number }) {
    const cfg = MODELS[params.model ?? "mms-fra"] ?? MODELS["mms-fra"];
    const user = await prisma.user.findUnique({ where: { id: params.userId }, select: { credits: true } });
    if (!user || user.credits < 1) return { success: false, error: "Credits insuffisants", cost: 0 };

    try {
      const response = await fetch(`${HF_API_BASE}/${cfg.model}`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ inputs: params.text, parameters: { speed: params.speed ?? 1.0 } }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`HF audio error (${response.status}): ${err.slice(0, 200)}`);
      }

      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const binary = Array.from(bytes).map((b) => String.fromCharCode(b)).join("");
      const base64 = btoa(binary);
      const dataUrl = `data:audio/wav;base64,${base64}`;
      const cost = cfg.cost;
      const charge = Math.max(1, Math.ceil(cost * 100));

      const gen = await prisma.imageGeneration.create({
        data: {
          userId: params.userId, prompt: params.text.slice(0, 2000),
          model: cfg.model, provider: "huggingface",
          imageUrl: dataUrl, status: "completed", costUsd: cost,
          metadata: JSON.stringify({ type: "audio" }),
        },
      });

      await prisma.user.update({ where: { id: params.userId }, data: { credits: { decrement: charge } } });
      await prisma.creditTransaction.create({
        data: { userId: params.userId, amount: -charge, balance: (user.credits ?? 0) - charge, type: "usage", resourceType: "audio_generation", resourceId: gen.id, description: `Audio: ${params.text.slice(0, 100)}` },
      });

      logger.info("audio_generated", { generationId: gen.id, model: cfg.model, cost });
      return { success: true, audioUrl: dataUrl, audioBase64: base64, generationId: gen.id, cost };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error("audio_generation_failed", { error: msg });
      return { success: false, error: msg, cost: 0 };
    }
  }
}

export const audioGenerator = new AudioGenerator();