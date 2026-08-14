// ============================================================
// AUDIO GENERATOR — Synthèse vocale via Hugging Face (gratuit)
// ============================================================

import { prisma } from "./prisma";
import { logger } from "./logger";
import { queryHF, bufferToBase64 } from "./huggingface";

interface AudioParams {
  userId: string;
  text: string;
  model?: string;
}

class AudioGenerator {
  async generate(params: AudioParams) {
    const modelId = params.model === "bark" ? "suno/bark" : "facebook/mms-tts-fra";

    try {
      const response = await queryHF(modelId, {
        inputs: params.text,
      });

      if (!response.ok) {
        const err = await response.text();
        if (response.status === 503) {
          return { success: false, error: "Le modèle audio se charge, veuillez réessayer...", cost: 0 };
        }
        throw new Error(`HF audio error (${response.status}): ${err.slice(0, 200)}`);
      }

      const buffer = await response.arrayBuffer();
      const base64 = await bufferToBase64(buffer);
      const dataUrl = `data:audio/wav;base64,${base64}`;

      const gen = await prisma.imageGeneration.create({
        data: {
          userId: params.userId,
          prompt: params.text.slice(0, 2000),
          model: modelId,
          provider: "huggingface",
          imageUrl: dataUrl,
          status: "completed",
          costUsd: 0,
          metadata: JSON.stringify({ type: "audio", format: "wav" }),
        },
      });

      logger.info("audio_generated_free", { generationId: gen.id, model: modelId });
      return { success: true, audioUrl: dataUrl, audioBase64: base64, generationId: gen.id, cost: 0 };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error("audio_generation_failed", { error: msg });
      return { success: false, error: msg, cost: 0 };
    }
  }
}

export const audioGenerator = new AudioGenerator();