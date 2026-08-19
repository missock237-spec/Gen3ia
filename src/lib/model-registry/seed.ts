// ============================================================
// SEED — Catalogue initial de modèles Gen3ia
// ------------------------------------------------------------
//  À appeler une fois au démarrage (ou via /api/admin/model-registry/seed)
//  pour initialiser le catalogue avec les modèles déjà intégrés.
// ============================================================

import { modelRegistry } from './index';
import type { ModelRegistryEntry } from './index';
import { createLogger } from '@/lib/logger';

const log = createLogger('model-registry-seed');

const SEED_MODELS: Array<Omit<ModelRegistryEntry, 'id' | 'createdAt' | 'updatedAt'>> = [
  // ─── LLM (Groq) ────────────────────────────────────────────────────────
  {
    name: 'llama-3.3-70b-versatile',
    providerModelId: 'llama-3.3-70b-versatile',
    provider: 'groq',
    type: 'llm',
    capabilities: ['chat', 'completion', 'function-calling', 'reasoning', 'code-generation', 'multi-lingual'],
    contextWindow: 128_000,
    pricing: { inputPerMillionTokens: 0.59, outputPerMillionTokens: 0.79, isFree: false },
    license: 'open-source',
    languages: ['en', 'fr', 'es', 'de', 'it', 'pt', 'nl'],
    architecture: 'transformer',
    parametersB: 70,
    description: 'Meta Llama 3.3 70B, optimisé pour le chat multi-tours, code et raisonnement.',
    tags: ['meta', 'llama', 'chat', 'reasoning'],
    status: 'active',
  },
  {
    name: 'llama-3.1-8b-instant',
    providerModelId: 'llama-3.1-8b-instant',
    provider: 'groq',
    type: 'llm',
    capabilities: ['chat', 'completion', 'function-calling', 'multi-lingual'],
    contextWindow: 8_000,
    pricing: { inputPerMillionTokens: 0.05, outputPerMillionTokens: 0.08, isFree: false },
    license: 'open-source',
    languages: ['en', 'fr', 'es', 'de'],
    architecture: 'transformer',
    parametersB: 8,
    description: 'Llama 3.1 8B instant — latence minimale pour le routing agent.',
    tags: ['meta', 'llama', 'fast'],
    status: 'active',
  },
  {
    name: 'mixtral-8x7b-32768',
    providerModelId: 'mixtral-8x7b-32768',
    provider: 'groq',
    type: 'llm',
    capabilities: ['chat', 'completion', 'function-calling', 'multi-lingual', 'long-context'],
    contextWindow: 32_768,
    pricing: { inputPerMillionTokens: 0.24, outputPerMillionTokens: 0.24, isFree: false },
    license: 'open-source',
    languages: ['en', 'fr', 'es', 'de', 'it'],
    architecture: 'mixture-of-experts',
    parametersB: 47,
    description: 'Mistral Mixtral 8x7B MoE — long contexte 32K, haute qualité.',
    tags: ['mistral', 'moe', 'long-context'],
    status: 'active',
  },
  {
    name: 'deepseek-r1-distill-llama-70b',
    providerModelId: 'deepseek-r1-distill-llama-70b',
    provider: 'groq',
    type: 'llm',
    capabilities: ['chat', 'reasoning', 'function-calling', 'code-generation'],
    contextWindow: 128_000,
    pricing: { inputPerMillionTokens: 0.75, outputPerMillionTokens: 0.99, isFree: false },
    license: 'open-source',
    architecture: 'transformer',
    parametersB: 70,
    description: 'DeepSeek R1 distillé — optimisé pour le raisonnement logique avancé.',
    tags: ['deepseek', 'reasoning'],
    status: 'active',
  },
  {
    name: 'qwen-2.5-coder-32b',
    providerModelId: 'qwen-2.5-coder-32b',
    provider: 'groq',
    type: 'llm',
    capabilities: ['chat', 'code-generation', 'function-calling'],
    contextWindow: 32_768,
    pricing: { inputPerMillionTokens: 0.29, outputPerMillionTokens: 0.39, isFree: false },
    license: 'open-source',
    architecture: 'transformer',
    parametersB: 32,
    description: 'Qwen 2.5 Coder — spécialisé pour la génération de code.',
    tags: ['qwen', 'coder'],
    status: 'active',
  },

  // ─── LLM (OpenAI) ──────────────────────────────────────────────────────
  {
    name: 'gpt-4o',
    providerModelId: 'gpt-4o',
    provider: 'openai',
    type: 'vision-llm',
    capabilities: ['chat', 'completion', 'function-calling', 'vision', 'reasoning', 'code-generation', 'multi-lingual'],
    contextWindow: 128_000,
    pricing: { inputPerMillionTokens: 2.50, outputPerMillionTokens: 10.00 },
    license: 'proprietary',
    languages: ['en', 'fr', 'es', 'de', 'ja', 'ko', 'zh'],
    architecture: 'transformer',
    parametersB: 200,
    description: 'OpenAI GPT-4o — multimodal, vision, raisonnement.',
    tags: ['openai', 'gpt', 'vision', 'multimodal'],
    status: 'active',
  },
  {
    name: 'gpt-4o-mini',
    providerModelId: 'gpt-4o-mini',
    provider: 'openai',
    type: 'llm',
    capabilities: ['chat', 'completion', 'function-calling', 'vision', 'multi-lingual'],
    contextWindow: 128_000,
    pricing: { inputPerMillionTokens: 0.15, outputPerMillionTokens: 0.60 },
    license: 'proprietary',
    architecture: 'transformer',
    description: 'OpenAI GPT-4o mini — équilibré coût/qualité.',
    tags: ['openai', 'gpt', 'mini', 'fast'],
    status: 'active',
  },
  {
    name: 'openai-tts-1',
    providerModelId: 'tts-1',
    provider: 'openai',
    type: 'audio-tts',
    capabilities: ['audio-output'],
    pricing: { perMillionChars: 15 },
    license: 'proprietary',
    languages: ['en', 'fr', 'de', 'es'],
    description: 'OpenAI TTS-1 — synthèse vocale temps réel.',
    tags: ['openai', 'tts'],
    status: 'active',
  },
  {
    name: 'openai-tts-1-hd',
    providerModelId: 'tts-1-hd',
    provider: 'openai',
    type: 'audio-tts',
    capabilities: ['audio-output'],
    pricing: { perMillionChars: 30 },
    license: 'proprietary',
    languages: ['en', 'fr', 'de', 'es'],
    description: 'OpenAI TTS-1 HD — qualité supérieure pour audio pro.',
    tags: ['openai', 'tts', 'hd'],
    status: 'active',
  },

  // ─── LLM (Anthropic) ───────────────────────────────────────────────────
  {
    name: 'claude-3-haiku-20240307',
    providerModelId: 'claude-3-haiku-20240307',
    provider: 'anthropic',
    type: 'vision-llm',
    capabilities: ['chat', 'completion', 'function-calling', 'vision', 'multi-lingual'],
    contextWindow: 200_000,
    pricing: { inputPerMillionTokens: 0.25, outputPerMillionTokens: 1.25 },
    license: 'proprietary',
    languages: ['en', 'fr', 'es', 'de', 'ja'],
    architecture: 'transformer',
    description: 'Claude 3 Haiku — ultra-rapide, long contexte 200K.',
    tags: ['anthropic', 'claude', 'fast'],
    status: 'active',
  },
  {
    name: 'claude-3-opus-20240229',
    providerModelId: 'claude-3-opus-20240229',
    provider: 'anthropic',
    type: 'vision-llm',
    capabilities: ['chat', 'completion', 'function-calling', 'vision', 'reasoning', 'multi-lingual'],
    contextWindow: 200_000,
    pricing: { inputPerMillionTokens: 15, outputPerMillionTokens: 75 },
    license: 'proprietary',
    architecture: 'transformer',
    description: 'Claude 3 Opus — top qualité raisonnement.',
    tags: ['anthropic', 'claude', 'opus'],
    status: 'active',
  },

  // ─── Image (Hugging Face — gratuits) ──────────────────────────────────
  {
    name: 'FLUX.1-schnell',
    providerModelId: 'black-forest-labs/FLUX.1-schnell',
    provider: 'black-forest-labs',
    type: 'image-generation',
    capabilities: ['image-output'],
    pricing: { isFree: true },
    license: 'open-source',
    architecture: 'rectified-flow-transformer',
    parametersB: 12,
    description: 'FLUX.1 schnell — modèle d\'image ultra-rapide (4 étapes).',
    tags: ['flux', 'fast', 'free'],
    status: 'active',
  },
  {
    name: 'stable-diffusion-xl-base-1.0',
    providerModelId: 'stabilityai/stable-diffusion-xl-base-1.0',
    provider: 'stability',
    type: 'image-generation',
    capabilities: ['image-output'],
    pricing: { isFree: true },
    license: 'open-source',
    architecture: 'diffusion',
    parametersB: 6.6,
    description: 'Stable Diffusion XL base — qualité photo-réaliste.',
    tags: ['sdxl', 'lora-compatible', 'free'],
    status: 'active',
  },
  {
    name: 'stable-diffusion-3-medium',
    providerModelId: 'stabilityai/stable-diffusion-3-medium-diffusers',
    provider: 'stability',
    type: 'image-generation',
    capabilities: ['image-output'],
    pricing: { isFree: true },
    license: 'research',
    architecture: 'diffusion-transformer',
    parametersB: 2.5,
    description: 'Stable Diffusion 3 Medium — nouvelle archi MMDiT.',
    tags: ['sd3', 'free'],
    status: 'preview',
  },
  {
    name: 'sdxl-turbo',
    providerModelId: 'stabilityai/sdxl-turbo',
    provider: 'stability',
    type: 'image-generation',
    capabilities: ['image-output'],
    pricing: { isFree: true },
    license: 'research',
    architecture: 'adversarial-diffusion',
    parametersB: 6.6,
    description: 'SDXL Turbo — 1 step, latence < 1s.',
    tags: ['sdxl', 'turbo', 'fast', 'free'],
    status: 'active',
  },

  // ─── Audio (Hugging Face — gratuits) ───────────────────────────────────
  {
    name: 'bark',
    providerModelId: 'suno/bark',
    provider: 'suno',
    type: 'audio-tts',
    capabilities: ['audio-output'],
    pricing: { isFree: true },
    license: 'open-source',
    languages: ['en', 'fr', 'de', 'es', 'ja', 'ko', 'zh'],
    architecture: 'transformer',
    parametersB: 1,
    description: 'Bark — TTS multilingue + effets non-verbaux (rires, soupirs).',
    tags: ['bark', 'multilingual', 'free'],
    status: 'active',
  },
  {
    name: 'mms-tts-fra',
    providerModelId: 'facebook/mms-tts-fra',
    provider: 'huggingface',
    type: 'audio-tts',
    capabilities: ['audio-output'],
    pricing: { isFree: true },
    license: 'open-source',
    languages: ['fr'],
    architecture: 'transformer',
    description: 'Facebook MMS-TTS français — synthèse vocale française.',
    tags: ['mms', 'fra', 'free'],
    status: 'active',
  },
  {
    name: 'speecht5-tts',
    providerModelId: 'microsoft/speecht5_tts',
    provider: 'huggingface',
    type: 'audio-tts',
    capabilities: ['audio-output'],
    pricing: { isFree: true },
    license: 'open-source',
    languages: ['en'],
    architecture: 'transformer',
    description: 'Microsoft SpeechT5 — TTS anglais quality.',
    tags: ['speecht5', 'free'],
    status: 'active',
  },
];

/**
 * Insère tous les modèles de seed dans le catalogue.
 * Idempotent: ne remplace pas les modèles existants avec usageStats.
 */
export async function seedModelRegistry(): Promise<{ inserted: number; updated: number; total: number }> {
  let inserted = 0;
  let updated = 0;

  for (const entry of SEED_MODELS) {
    try {
      const existing = await modelRegistry.getByName(entry.name);
      if (existing) {
        // Update sans écraser usageStats
        await modelRegistry.upsert({ ...entry, id: existing.id });
        updated++;
      } else {
        await modelRegistry.upsert(entry);
        inserted++;
      }
    } catch (e) {
      log.warn('seed_model_failed', { name: entry.name, error: e instanceof Error ? e.message : '' });
    }
  }

  log.info('seed_complete', { inserted, updated, total: SEED_MODELS.length });
  return { inserted, updated, total: SEED_MODELS.length };
}
