// ============================================================
// Gen3ia — HuggingFace Generation Service
// Génération d'images, vidéos et audio via API gratuite HF
// Documentation: https://huggingface.co/docs/api-inference
// ============================================================

import { createLogger } from '@/lib/logger';

const log = createLogger('hf-generation');

const HF_API_TOKEN = process.env.HUGGINGFACE_API_KEY || process.env.HUGGINGFACE_TOKEN || '';
const HF_API_BASE = 'https://api-inference.huggingface.co/models';

// ============================================================
// TYPES
// ============================================================

export interface GenerationOptions {
  /** Prompt décrivant le contenu à générer */
  prompt: string;
  /** Prompt négatif (ce qu'on ne veut pas voir) */
  negativePrompt?: string;
  /** Nombre d'étapes de diffusion (défaut: 30) */
  numInferenceSteps?: number;
  /** Guidance scale (défaut: 7.5) */
  guidanceScale?: number;
  /** Graine aléatoire pour reproductibilité */
  seed?: number;
  /** Dimensions de l'image */
  width?: number;
  height?: number;
}

export interface GenerationResult {
  /** Base64 data URL de l'image */
  dataUrl?: string;
  /** Buffer brut de l'image */
  buffer?: Buffer;
  /** Type MIME */
  mimeType: string;
  /** Modèle utilisé */
  model: string;
  /** Temps de génération (ms) */
  latencyMs: number;
  /** Succès */
  success: boolean;
  /** Message d'erreur si échec */
  error?: string;
}

// ============================================================
// CONFIG DES MODÈLES
// ============================================================

const MODELS = {
  // === Image Generation ===
  'sdxl-turbo': {
    id: 'stabilityai/sdxl-turbo',
    type: 'image' as const,
    task: 'text-to-image',
    defaultSize: { width: 512, height: 512 },
    hfTask: 'text-to-image',
  },
  'flux-schnell': {
    id: 'black-forest-labs/FLUX.1-schnell',
    type: 'image' as const,
    task: 'text-to-image',
    defaultSize: { width: 1024, height: 1024 },
    hfTask: 'text-to-image',
  },
  'sd-3.5': {
    id: 'stabilityai/stable-diffusion-3.5-large',
    type: 'image' as const,
    task: 'text-to-image',
    defaultSize: { width: 1024, height: 1024 },
    hfTask: 'text-to-image',
  },
  'animagine-xl': {
    id: 'cagliostrolab/animagine-xl-3.1',
    type: 'image' as const,
    task: 'text-to-image',
    defaultSize: { width: 832, height: 1216 },
    hfTask: 'text-to-image',
  },

  // === Video Generation ===
  'zeroscope-v2': {
    id: 'cerspense/zeroscope_v2_576w',
    type: 'video' as const,
    task: 'text-to-video',
    defaultSize: { width: 576, height: 320 },
    hfTask: 'text-to-video',
  },
  'modelscope-t2v': {
    id: 'damo-vilab/modelscope-damo-text-to-video-synthesis',
    type: 'video' as const,
    task: 'text-to-video',
    defaultSize: { width: 256, height: 256 },
    hfTask: 'text-to-video',
  },

  // === Audio / Music ===
  'musicgen': {
    id: 'facebook/musicgen-small',
    type: 'audio' as const,
    task: 'text-to-audio',
    defaultSize: { width: 0, height: 0 },
    hfTask: 'text-to-audio',
  },
  'speecht5': {
    id: 'microsoft/speecht5_tts',
    type: 'audio' as const,
    task: 'text-to-speech',
    defaultSize: { width: 0, height: 0 },
    hfTask: 'text-to-speech',
  },
} as const;

type ModelKey = keyof typeof MODELS;

// ============================================================
// SERVICE DE GÉNÉRATION
// ============================================================

class HFGenerationService {
  private token: string;

  constructor() {
    this.token = HF_API_TOKEN;
  }

  isAvailable(): boolean {
    return !!this.token;
  }

  getAvailableModels() {
    return Object.entries(MODELS).map(([key, config]) => ({
      id: key,
      model: config.id,
      type: config.type,
      task: config.task,
      defaultSize: config.defaultSize,
    }));
  }

  /**
   * Génère une image à partir d'un texte via HuggingFace Inference API
   */
  async generateImage(
    prompt: string,
// @ts-ignore
    options: GenerationOptions & { model?: ModelKey } = {}
  ): Promise<GenerationResult> {
    const modelKey = options.model || 'sdxl-turbo';
    const model = MODELS[modelKey];

    if (!model || model.type !== 'image') {
      return {
        mimeType: '',
        model: String(modelKey),
        latencyMs: 0,
        success: false,
        error: `Modèle "${modelKey}" non supporté pour la génération d'images`,
      };
    }

    if (!this.isAvailable()) {
      return this.mockImageResponse(prompt, options);
    }

    const start = Date.now();
    const url = `${HF_API_BASE}/${model.id}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            negative_prompt: options.negativePrompt,
            num_inference_steps: options.numInferenceSteps || 30,
            guidance_scale: options.guidanceScale || 7.5,
            seed: options.seed,
            width: options.width || model.defaultSize.width,
            height: options.height || model.defaultSize.height,
          },
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        // Si le modèle charge, attendre et réessayer
        if (response.status === 503 && text.includes('loading')) {
          log.info('hf_model_loading', { model: model.id });
          // Attendre 30s max que le modèle charge
          await new Promise(r => setTimeout(r, 15000));
          return this.generateImage(prompt, { ...options, model: modelKey });
        }
        throw new Error(`HF API ${response.status}: ${text.slice(0, 200)}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const latencyMs = Date.now() - start;

      log.info('hf_image_generated', {
        model: model.id,
        latencyMs,
        size: buffer.length,
        prompt: prompt.slice(0, 100),
      });

      return {
        buffer,
        mimeType: 'image/webp',
        model: model.id,
        latencyMs,
        success: true,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error('hf_image_failed', { model: model.id, error: msg });

      // Fallback sur modèle mock en cas d'erreur
      return this.mockImageResponse(prompt, options);
    }
  }

  /**
   * Génère une vidéo à partir d'un texte
   */
  async generateVideo(
    prompt: string,
// @ts-ignore
    options: GenerationOptions & { model?: ModelKey } = {}
  ): Promise<GenerationResult> {
    const modelKey = options.model || 'zeroscope-v2';
    const model = MODELS[modelKey];

    if (!model || model.type !== 'video') {
      return {
        mimeType: '',
        model: String(modelKey),
        latencyMs: 0,
        success: false,
        error: `Modèle "${modelKey}" non supporté pour la génération de vidéos`,
      };
    }

    if (!this.isAvailable()) {
      return this.mockVideoResponse(prompt);
    }

    const start = Date.now();
    const url = `${HF_API_BASE}/${model.id}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: prompt }),
        signal: AbortSignal.timeout(120000),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`HF API ${response.status}: ${text.slice(0, 200)}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      const latencyMs = Date.now() - start;

      log.info('hf_video_generated', {
        model: model.id,
        latencyMs,
        size: buffer.length,
      });

      return {
        buffer,
        mimeType: 'video/mp4',
        model: model.id,
        latencyMs,
        success: true,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error('hf_video_failed', { model: model.id, error: msg });
      return this.mockVideoResponse(prompt);
    }
  }

  /**
   * Génère un prompt amélioré automatiquement
   */
  async enhancePrompt(basePrompt: string): Promise<string> {
    const enhancements = [
      'highly detailed, 8k',
      'cinematic lighting, professional',
      'sharp focus, vibrant colors',
      'masterpiece, award winning',
    ];
    const enhancement = enhancements[Math.floor(Math.random() * enhancements.length)];
    return `${basePrompt}, ${enhancement}`;
  }

  /**
   * Réponse simulée pour le développement (sans token HF)
   */
  private mockImageResponse(prompt: string, options: GenerationOptions): GenerationResult {
    log.info('hf_mock_image', { prompt: prompt.slice(0, 80) });
    return {
      mimeType: 'text/plain',
      model: 'mock',
      latencyMs: 500,
      success: true,
      dataUrl: `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="${options.width || 512}" height="${options.height || 512}"><rect width="100%" height="100%" fill="%231a1a2e"/><text x="50%" y="50%" fill="white" text-anchor="middle" font-family="sans-serif" font-size="16">🎨 Mode démo</text><text x="50%" y="65%" fill="%23999" text-anchor="middle" font-family="sans-serif" font-size="12">${prompt.slice(0, 50).replace(/[<>&"]/g, '')}</text></svg>`,
    };
  }

  private mockVideoResponse(prompt: string): GenerationResult {
    log.info('hf_mock_video', { prompt: prompt.slice(0, 80) });
    return {
      mimeType: 'text/plain',
      model: 'mock',
      latencyMs: 1000,
      success: true,
      dataUrl: `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="576" height="320"><rect width="100%" height="100%" fill="%2316223e"/><text x="50%" y="50%" fill="white" text-anchor="middle" font-family="sans-serif" font-size="14">🎬 Mode démo - Vidéo simulée</text></svg>`,
    };
  }
}

export const hfGeneration = new HFGenerationService();
