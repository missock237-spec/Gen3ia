import { createLogger } from '@/lib/logger';

const log = createLogger('huggingface-client');

const HF_API_BASE = 'https://api-inference.huggingface.co/models';

export interface HfGenerationOptions {
  model: string;
  inputs: string | Record<string, unknown>;
  parameters?: Record<string, unknown>;
  useCache?: boolean;
  waitForModel?: boolean;
  timeoutMs?: number;
}

export interface HfImageResult {
  imageUrl: string;
  base64: string;
  model: string;
  durationMs: number;
  seed?: number;
}

export interface HfAudioResult {
  audioUrl: string;
  durationMs: number;
  sampleRate?: number;
  format?: string;
}

export interface HfVideoResult {
  videoUrl: string;
  durationMs: number;
  frames?: number;
  fps?: number;
}

export interface HfTextResult {
  text: string;
  model: string;
  durationMs: number;
}

export class HuggingFaceClient {
  private token: string;
  private baseUrl: string;

  constructor() {
    this.token = process.env.HUGGINGFACE_TOKEN || '';
    this.baseUrl = HF_API_BASE;
  }

  isConfigured(): boolean {
    return this.token.length > 0;
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(options: HfGenerationOptions): Promise<T> {
    if (!this.isConfigured()) {
      throw new Error('HUGGINGFACE_TOKEN non configuré');
    }

    const controller = new AbortController();
    const timeout = options.timeoutMs || 120_000;
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const url = `${this.baseUrl}/${options.model}`;
      const body = JSON.stringify({
        inputs: options.inputs,
        parameters: {
          ...options.parameters,
          ...(options.useCache !== undefined ? { use_cache: options.useCache } : {}),
          ...(options.waitForModel !== undefined ? { wait_for_model: options.waitForModel } : {}),
        },
      });

      const res = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body,
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorBody = await res.text().catch(() => '{}');
        if (res.status === 503) {
          log.warn(`Modèle ${options.model} en chargement sur HuggingFace`);
          throw new Error(`Le modèle ${options.model} est en cours de chargement. Réessaye dans quelques secondes.`);
        }
        throw new Error(`HuggingFace API error ${res.status}: ${errorBody.slice(0, 200)}`);
      }

      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Génération d'image (modèles gratuits: stabilityai/stable-diffusion-3.5-large-turbo, runwayml/stable-diffusion-v1-5, black-forest-labs/FLUX.1-schnell)
   */
  async generateImage(prompt: string, options?: {
    model?: string;
    width?: number;
    height?: number;
    negativePrompt?: string;
    numInferenceSteps?: number;
    guidanceScale?: number;
    seed?: number;
  }): Promise<HfImageResult> {
    const start = Date.now();
    const model = options?.model || 'stabilityai/stable-diffusion-3.5-large-turbo';

    const parameters: Record<string, unknown> = {
      ...(options?.negativePrompt ? { negative_prompt: options.negativePrompt } : {}),
      ...(options?.numInferenceSteps ? { num_inference_steps: options.numInferenceSteps } : { num_inference_steps: 4 }),
      ...(options?.guidanceScale ? { guidance_scale: options.guidanceScale } : { guidance_scale: 3.5 }),
      ...(options?.seed !== undefined ? { seed: options.seed } : {}),
      ...(options?.width ? { width: options.width } : {}),
      ...(options?.height ? { height: options.height } : {}),
    };

    try {
      const response = await this.request<ArrayBuffer>({
        model,
        inputs: prompt,
        parameters,
        waitForModel: true,
        useCache: false,
        timeoutMs: 120_000,
      });

      // Convertir ArrayBuffer en base64
      const bytes = new Uint8Array(response);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      const imageUrl = `data:image/png;base64,${base64}`;

      log.info('Image générée avec HuggingFace', {
        model,
        prompt: prompt.slice(0, 50),
        durationMs: Date.now() - start,
      });

      return {
        imageUrl,
        base64,
        model,
        durationMs: Date.now() - start,
        seed: options?.seed,
      };
    } catch (error) {
      log.error('Échec génération image HuggingFace', {
        model,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Génération audio/musique (modèles gratuits: facebook/musicgen-small, espnet/kan-bayashi_ljspeech_vits)
   */
  async generateAudio(
    prompt: string,
    options?: { model?: string; duration?: number }
  ): Promise<HfAudioResult> {
    const start = Date.now();
    const model = options?.model || 'facebook/musicgen-small';

    const parameters: Record<string, unknown> = {
      ...(options?.duration ? { max_new_tokens: Math.round(options.duration * 50) } : { max_new_tokens: 256 }),
    };

    try {
      const response = await this.request<ArrayBuffer>({
        model,
        inputs: prompt,
        parameters,
        waitForModel: true,
        useCache: false,
        timeoutMs: 180_000,
      });

      const bytes = new Uint8Array(response);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      const audioUrl = `data:audio/wav;base64,${base64}`;

      log.info('Audio généré avec HuggingFace', { model, durationMs: Date.now() - start });

      return {
        audioUrl,
        durationMs: Date.now() - start,
        sampleRate: 16000,
        format: 'wav',
      };
    } catch (error) {
      log.error('Échec génération audio HuggingFace', {
        model,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Génération de texte (modèles gratuits: mistralai/Mistral-7B-Instruct-v0.3, HuggingFaceH4/zephyr-7b-beta)
   */
  async generateText(
    prompt: string,
    options?: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      topP?: number;
      topK?: number;
      repetitionPenalty?: number;
    }
  ): Promise<HfTextResult> {
    const start = Date.now();
    const model = options?.model || 'HuggingFaceH4/zephyr-7b-beta';

    const parameters: Record<string, unknown> = {
      max_new_tokens: options?.maxTokens || 512,
      temperature: options?.temperature || 0.7,
      top_p: options?.topP || 0.95,
      top_k: options?.topK || 50,
      repetition_penalty: options?.repetitionPenalty || 1.0,
      return_full_text: false,
    };

    try {
      const response = await this.request<Array<{ generated_text: string }>>({
        model,
        inputs: prompt,
        parameters,
        waitForModel: true,
        useCache: true,
        timeoutMs: 60_000,
      });

      const text = response[0]?.generated_text || '';

      log.info('Texte généré avec HuggingFace', {
        model,
        length: text.length,
        durationMs: Date.now() - start,
      });

      return {
        text,
        model,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      log.error('Échec génération texte HuggingFace', {
        model,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Traduction (modèle gratuit: facebook/nllb-200-distilled-600M)
   */
  async translate(
    text: string,
    sourceLang: string,
    targetLang: string,
    options?: { model?: string }
  ): Promise<HfTextResult> {
    const model = options?.model || 'facebook/nllb-200-distilled-600M';
    const prompt = `${text}`;

    return this.generateText(prompt, {
      model,
      maxTokens: 1024,
      temperature: 0.3,
      repetitionPenalty: 1.2,
    });
  }

  /**
   * Résumé de texte (modèle gratuit: facebook/bart-large-cnn)
   */
  async summarize(
    text: string,
    options?: { model?: string; maxLength?: number; minLength?: number }
  ): Promise<HfTextResult> {
    const start = Date.now();
    const model = options?.model || 'facebook/bart-large-cnn';

    const parameters: Record<string, unknown> = {
      max_length: options?.maxLength || 150,
      min_length: options?.minLength || 40,
    };

    try {
      const response = await this.request<Array<{ summary_text: string }>>({
        model,
        inputs: text,
        parameters,
        waitForModel: true,
        useCache: true,
        timeoutMs: 60_000,
      });

      const summary = response[0]?.summary_text || '';

      return {
        text: summary,
        model,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      log.error('Échec résumé HuggingFace', {
        model,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * TTS — Text-to-Speech (modèle gratuit: espnet/kan-bayashi_ljspeech_vits)
   */
  async textToSpeech(
    text: string,
    options?: { model?: string; voice?: string }
  ): Promise<HfAudioResult> {
    const model = options?.model || 'espnet/kan-bayashi_ljspeech_vits';
    return this.generateAudio(text, { model });
  }

  /**
   * Liste des modèles les plus populaires
   */
  getAvailableModels() {
    return {
      image: [
        { id: 'stabilityai/stable-diffusion-3.5-large-turbo', type: 'text-to-image', cost: 'free', quality: 'high' },
        { id: 'black-forest-labs/FLUX.1-schnell', type: 'text-to-image', cost: 'free', quality: 'high' },
        { id: 'runwayml/stable-diffusion-v1-5', type: 'text-to-image', cost: 'free', quality: 'medium' },
        { id: 'prompthero/openjourney', type: 'text-to-image', cost: 'free', quality: 'medium' },
        { id: 'stabilityai/stable-diffusion-2-1', type: 'text-to-image', cost: 'free', quality: 'medium' },
      ],
      audio: [
        { id: 'facebook/musicgen-small', type: 'text-to-audio', cost: 'free', quality: 'medium' },
        { id: 'espnet/kan-bayashi_ljspeech_vits', type: 'text-to-speech', cost: 'free', quality: 'high' },
        { id: 'suno/bark', type: 'text-to-speech', cost: 'free', quality: 'high' },
      ],
      text: [
        { id: 'mistralai/Mistral-7B-Instruct-v0.3', type: 'text-generation', cost: 'free', quality: 'high' },
        { id: 'HuggingFaceH4/zephyr-7b-beta', type: 'text-generation', cost: 'free', quality: 'medium' },
        { id: 'facebook/bart-large-cnn', type: 'summarization', cost: 'free', quality: 'high' },
        { id: 'facebook/nllb-200-distilled-600M', type: 'translation', cost: 'free', quality: 'high' },
        { id: 'google/flan-t5-large', type: 'text-generation', cost: 'free', quality: 'medium' },
      ],
    };
  }
}

export function createHuggingFaceClient(): HuggingFaceClient {
  return new HuggingFaceClient();
}

export const hfClient = new HuggingFaceClient();
