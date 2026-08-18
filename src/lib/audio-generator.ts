// ============================================================
// AUDIO GENERATOR — Synthèse vocale
// ------------------------------------------------------------
// T28 — Architecture:
//   Provider primaire : Hugging Face Inference (gratuit)
//     → Bark (multilingue + effets sonores non-verbaux)
//     → Facebook MMS-TTS (français)
//     → Microsoft SpeechT5 (anglais)
//     → VITS (japonais, coréen)
//   Provider fallback : OpenAI TTS (tts-1, tts-1-hd) si HF échoue
//     ou si l'utilisateur a explicitement demandé `engine: 'openai'`
//
// L'API publique `generate()` est conservée — l'ajout de `engine` est optionnel.
// ============================================================

import { prisma } from './prisma';
import { logger } from './logger';
import { queryHF, bufferToBase64 } from './huggingface';

// ─── Types ────────────────────────────────────────────────────────────────

interface AudioParams {
  userId: string;
  text: string;
  /** Modèle HF demandé (bark | mms | speecht5 | vits) */
  model?: string;
  /** Forcer un moteur ('hf' | 'openai'). Par défaut 'hf' avec fallback 'openai'. */
  engine?: 'hf' | 'openai';
  /** Voix OpenAI (alloy | nova | echo | fable | onyx | shimmer) — défaut 'alloy' */
  voice?: string;
  /** Format de sortie OpenAI (mp3 | opus | aac | flac) — défaut 'mp3' */
  format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav';
  /** Langue (utile pour MMS-TTS / VITS) */
  language?: string;
}

interface GenerationResult {
  success: boolean;
  audioUrl?: string;
  audioBase64?: string;
  generationId?: string;
  cost: number;
  error?: string;
  provider?: string;
  model?: string;
  attempts?: Array<{ engine: string; ok: boolean; error?: string; latencyMs: number }>;
}

// ─── Catalogue de modèles HF ──────────────────────────────────────────────

interface HfAudioModel {
  hfId: string;
  label: string;
  /** Langues supportées (vide = multilingue) */
  languages: string[];
  /** Délai initial d'attente si 503 (model loading) */
  retryDelayMs: number;
  maxRetries: number;
}

const HF_AUDIO_MODELS: HfAudioModel[] = [
  {
    hfId: 'suno/bark',
    label: 'bark',
    languages: [], // multilingue
    retryDelayMs: 8_000,
    maxRetries: 2,
  },
  {
    hfId: 'facebook/mms-tts-fra',
    label: 'mms-fra',
    languages: ['fr', 'fra'],
    retryDelayMs: 5_000,
    maxRetries: 2,
  },
  {
    hfId: 'microsoft/speecht5_tts',
    label: 'speecht5',
    languages: ['en', 'eng'],
    retryDelayMs: 5_000,
    maxRetries: 2,
  },
  {
    hfId: 'facebook/mms-tts-eng',
    label: 'mms-eng',
    languages: ['en', 'eng'],
    retryDelayMs: 5_000,
    maxRetries: 2,
  },
  {
    hfId: 'facebook/mms-tts-deu',
    label: 'mms-deu',
    languages: ['de', 'deu'],
    retryDelayMs: 5_000,
    maxRetries: 1,
  },
];

const HF_AUDIO_BY_LABEL: Record<string, HfAudioModel> = Object.fromEntries(
  HF_AUDIO_MODELS.map((m) => [m.label, m]),
);

// ─── OpenAI TTS (fallback) ───────────────────────────────────────────────

const OPENAI_TTS_VOICES = ['alloy', 'nova', 'echo', 'fable', 'onyx', 'shimmer'] as const;
type OpenAITTSVoice = typeof OPENAI_TTS_VOICES[number];

interface OpenAITTSParams {
  text: string;
  voice?: OpenAITTSVoice;
  model?: 'tts-1' | 'tts-1-hd';
  format?: 'mp3' | 'opus' | 'aac' | 'flac';
}

async function callOpenAITTS(params: OpenAITTSParams): Promise<{ ok: boolean; base64?: string; error?: string; latencyMs: number }> {
  const start = Date.now();
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) {
    return { ok: false, error: 'OPENAI_API_KEY non configuré', latencyMs: 0 };
  }
  const baseUrl = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  try {
    const response = await fetch(`${baseUrl}/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: params.model || 'tts-1',
        voice: params.voice || 'alloy',
        input: params.text,
        response_format: params.format || 'mp3',
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => 'unknown');
      return { ok: false, error: `OpenAI TTS HTTP ${response.status}: ${err.slice(0, 200)}`, latencyMs: Date.now() - start };
    }

    const buf = await response.arrayBuffer();
    const base64 = await bufferToBase64(buf);
    return { ok: true, base64, latencyMs: Date.now() - start };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - start,
    };
  }
}

// ─── Audio Generator (singleton) ──────────────────────────────────────────

class AudioGenerator {
  async generate(params: AudioParams): Promise<GenerationResult> {
    const attempts: GenerationResult['attempts'] = [];
    const text = params.text ?? '';

    if (!text || text.length === 0) {
      return { success: false, error: 'Texte vide', cost: 0 };
    }

    // 1. Déterminer l'ordre des moteurs à essayer
    const forcedEngine = params.engine;
    const tryHfFirst = forcedEngine !== 'openai';
    const tryOpenAiAfterHf = forcedEngine !== 'hf';

    // 2. Construire la chaîne de modèles HF
    let hfChain: HfAudioModel[] = [];
    if (tryHfFirst) {
      if (params.model && HF_AUDIO_BY_LABEL[params.model]) {
        hfChain = [
          HF_AUDIO_BY_LABEL[params.model],
          ...HF_AUDIO_MODELS.filter((m) => m.label !== params.model),
        ];
      } else {
        // Choisir en fonction de la langue, sinon fallback à bark (multilingue)
        const lang = (params.language || '').toLowerCase();
        const langMatch = HF_AUDIO_MODELS.find((m) =>
          m.languages.some((l) => l.toLowerCase() === lang),
        );
        hfChain = langMatch
          ? [langMatch, ...HF_AUDIO_MODELS.filter((m) => m.label !== langMatch.label)]
          : [...HF_AUDIO_MODELS];
      }
    }

    // 3. Tenter la chaîne HF
    if (hfChain.length > 0) {
      for (const model of hfChain) {
        const attempt = await this.tryHfModel(model, params);
        attempts.push({
          engine: `hf:${model.label}`,
          ok: attempt.success,
          error: attempt.error,
          latencyMs: attempt.latencyMs,
        });

        if (attempt.success && attempt.base64) {
          const dataUrl = `data:audio/wav;base64,${attempt.base64}`;
          const gen = await prisma.imageGeneration.create({
            data: {
              userId: params.userId,
              prompt: text.slice(0, 2000),
              model: model.label,
              provider: 'huggingface',
              imageUrl: dataUrl,
              status: 'completed',
              costUsd: 0,
              metadata: JSON.stringify({
                type: 'audio',
                format: 'wav',
                hfId: model.hfId,
                latencyMs: attempt.latencyMs,
                attempts,
              }),
            },
          });
          logger.info('audio_generated_free', {
            generationId: gen.id,
            model: model.label,
            latencyMs: attempt.latencyMs,
          });
          return {
            success: true,
            audioUrl: dataUrl,
            audioBase64: attempt.base64,
            generationId: gen.id,
            cost: 0,
            provider: 'huggingface',
            model: model.label,
            attempts,
          };
        }
        logger.warn('audio_hf_model_failed', {
          model: model.label,
          error: attempt.error?.slice(0, 200) ?? '',
        });
      }
    }

    // 4. Si OpenAI TTS est autorisé → fallback
    if (tryOpenAiAfterHf) {
      const voice = (params.voice && (OPENAI_TTS_VOICES as readonly string[]).includes(params.voice)
        ? (params.voice as OpenAITTSVoice)
        : 'alloy');
      const format = params.format && params.format !== 'wav' ? params.format : 'mp3';

      const oaiAttempt = await callOpenAITTS({
        text,
        voice,
        model: 'tts-1',
        format,
      });

      attempts.push({
        engine: 'openai:tts-1',
        ok: oaiAttempt.ok,
        error: oaiAttempt.error,
        latencyMs: oaiAttempt.latencyMs,
      });

      if (oaiAttempt.ok && oaiAttempt.base64) {
        const mimeType = format === 'mp3' ? 'audio/mpeg' : `audio/${format}`;
        const dataUrl = `data:${mimeType};base64,${oaiAttempt.base64}`;
        const gen = await prisma.imageGeneration.create({
          data: {
            userId: params.userId,
            prompt: text.slice(0, 2000),
            model: 'openai-tts-1',
            provider: 'openai',
            imageUrl: dataUrl,
            status: 'completed',
            costUsd: 0.015, // ~$0.015 / 1k chars pour tts-1
            metadata: JSON.stringify({
              type: 'audio',
              format,
              voice,
              latencyMs: oaiAttempt.latencyMs,
              attempts,
              fallback: true,
            }),
          },
        });
        logger.info('audio_generated_openai', {
          generationId: gen.id,
          model: 'openai-tts-1',
          latencyMs: oaiAttempt.latencyMs,
          voice,
        });
        return {
          success: true,
          audioUrl: dataUrl,
          audioBase64: oaiAttempt.base64,
          generationId: gen.id,
          cost: 0.015,
          provider: 'openai',
          model: 'openai-tts-1',
          attempts,
        };
      }

      // Essayer tts-1-hd en dernier recours
      const oaiHdAttempt = await callOpenAITTS({
        text,
        voice,
        model: 'tts-1-hd',
        format,
      });
      attempts.push({
        engine: 'openai:tts-1-hd',
        ok: oaiHdAttempt.ok,
        error: oaiHdAttempt.error,
        latencyMs: oaiHdAttempt.latencyMs,
      });

      if (oaiHdAttempt.ok && oaiHdAttempt.base64) {
        const mimeType = format === 'mp3' ? 'audio/mpeg' : `audio/${format}`;
        const dataUrl = `data:${mimeType};base64,${oaiHdAttempt.base64}`;
        const gen = await prisma.imageGeneration.create({
          data: {
            userId: params.userId,
            prompt: text.slice(0, 2000),
            model: 'openai-tts-1-hd',
            provider: 'openai',
            imageUrl: dataUrl,
            status: 'completed',
            costUsd: 0.03, // ~$0.03 / 1k chars pour tts-1-hd
            metadata: JSON.stringify({
              type: 'audio',
              format,
              voice,
              latencyMs: oaiHdAttempt.latencyMs,
              attempts,
              fallback: true,
              hd: true,
            }),
          },
        });
        logger.info('audio_generated_openai_hd', {
          generationId: gen.id,
          latencyMs: oaiHdAttempt.latencyMs,
        });
        return {
          success: true,
          audioUrl: dataUrl,
          audioBase64: oaiHdAttempt.base64,
          generationId: gen.id,
          cost: 0.03,
          provider: 'openai',
          model: 'openai-tts-1-hd',
          attempts,
        };
      }
    }

    // 5. Tous échoués
    const lastError = attempts[attempts.length - 1]?.error ?? 'all providers failed';
    logger.error('audio_generation_failed', { error: lastError, attempts });
    return {
      success: false,
      error: lastError,
      cost: 0,
      attempts,
    };
  }

  private async tryHfModel(
    model: HfAudioModel,
    params: AudioParams,
  ): Promise<{ success: boolean; base64?: string; error?: string; latencyMs: number }> {
    const start = Date.now();
    for (let attempt = 0; attempt <= model.maxRetries; attempt++) {
      try {
        const response = await queryHF(model.hfId, { inputs: params.text });
        if (response.status === 503) {
          if (attempt < model.maxRetries) {
            logger.info('audio_hf_model_loading', {
              model: model.label,
              retryIn: model.retryDelayMs,
              attempt,
            });
            await new Promise((r) => setTimeout(r, model.retryDelayMs));
            continue;
          }
          return {
            success: false,
            error: `HF model ${model.label} still loading after ${attempt + 1} retries`,
            latencyMs: Date.now() - start,
          };
        }
        if (!response.ok) {
          const err = await response.text().catch(() => 'unknown');
          return {
            success: false,
            error: `HF ${model.label} HTTP ${response.status}: ${err.slice(0, 200)}`,
            latencyMs: Date.now() - start,
          };
        }
        const buffer = await response.arrayBuffer();
        const base64 = await bufferToBase64(buffer);
        return { success: true, base64, latencyMs: Date.now() - start };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (attempt < model.maxRetries) {
          await new Promise((r) => setTimeout(r, model.retryDelayMs));
          continue;
        }
        return {
          success: false,
          error: `${model.label}: ${msg}`,
          latencyMs: Date.now() - start,
        };
      }
    }
    return {
      success: false,
      error: `${model.label}: exhausted retries`,
      latencyMs: Date.now() - start,
    };
  }

  /**
   * Liste des modèles audio disponibles pour l'UI.
   */
  listModels() {
    return {
      huggingface: HF_AUDIO_MODELS.map((m) => ({
        label: m.label,
        hfId: m.hfId,
        languages: m.languages,
      })),
      openai: {
        voices: OPENAI_TTS_VOICES,
        models: ['tts-1', 'tts-1-hd'],
        formats: ['mp3', 'opus', 'aac', 'flac'],
      },
    };
  }
}

export const audioGenerator = new AudioGenerator();
