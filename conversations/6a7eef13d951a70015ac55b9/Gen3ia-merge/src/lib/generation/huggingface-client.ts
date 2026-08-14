import { createLogger } from '@/lib/logger';
import { validateUrl, validateModelPath } from '@/lib/ssrf-protect';
const log = createLogger('huggingface-client');
const HF_API_BASE = 'https://api-inference.huggingface.co/models';

export interface HfGenerationOptions { model: string; inputs: string | Record<string, unknown>; parameters?: Record<string, unknown>; useCache?: boolean; waitForModel?: boolean; timeoutMs?: number; }
export interface HfImageResult { imageUrl: string; base64: string; model: string; durationMs: number; seed?: number; }
export interface HfAudioResult { audioUrl: string; durationMs: number; sampleRate?: number; format?: string; }
export interface HfTextResult { text: string; model: string; durationMs: number; }

export class HuggingFaceClient {
  private token: string;
  constructor() {
    this.token = process.env.HUGGINGFACE_TOKEN || '';
  }
  isConfigured(): boolean { return this.token.length > 0; }

  private getHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' };
  }

  private async requestJson<T>(options: HfGenerationOptions): Promise<T> {
    if (!this.isConfigured()) throw new Error('HUGGINGFACE_TOKEN non configuré');
    const modelValidation = validateModelPath(options.model);
    if (!modelValidation.safe) throw new Error(`Model invalide: ${modelValidation.error}`);
    const url = `${HF_API_BASE}/${options.model}`;
    const ssrfCheck = validateUrl(url, { allowedCategory: 'huggingface', requireHttps: true });
    if (!ssrfCheck.safe) throw new Error(`SSRF validation failed: ${ssrfCheck.error}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || 120000);
    try {
      const res = await fetch(url, {
        method: 'POST', headers: this.getHeaders(),
        body: JSON.stringify({ inputs: options.inputs, parameters: { ...options.parameters, ...(options.waitForModel ? { wait_for_model: true } : {}), ...(options.useCache !== undefined ? { use_cache: options.useCache } : {}) } }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const errorBody = await res.text().catch(() => '{}');
        if (res.status === 503) throw new Error(`Le modèle ${options.model} est en cours de chargement. Réessaye dans quelques secondes.`);
        throw new Error(`HuggingFace API error ${res.status}: ${errorBody.slice(0, 200)}`);
      }
      return await res.json();
    } finally { clearTimeout(timer); }
  }

  /** BUGFIX: Les modèles d'image et audio retournent du binaire (ArrayBuffer), pas du JSON */
  private async requestBinary(options: HfGenerationOptions): Promise<ArrayBuffer> {
    if (!this.isConfigured()) throw new Error('HUGGINGFACE_TOKEN non configuré');
    const modelValidation = validateModelPath(options.model);
    if (!modelValidation.safe) throw new Error(`Model invalide: ${modelValidation.error}`);
    const url = `${HF_API_BASE}/${options.model}`;
    const ssrfCheck = validateUrl(url, { allowedCategory: 'huggingface', requireHttps: true });
    if (!ssrfCheck.safe) throw new Error(`SSRF validation failed: ${ssrfCheck.error}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || 180000);
    try {
      const res = await fetch(url, {
        method: 'POST', headers: this.getHeaders(),
        body: JSON.stringify({ inputs: options.inputs, parameters: { ...options.parameters, wait_for_model: true } }),
        signal: controller.signal,
      });
      if (!res.ok) {
        if (res.status === 503) throw new Error(`Le modèle ${options.model} est en cours de chargement.`);
        throw new Error(`HuggingFace API error ${res.status}`);
      }
      return await res.arrayBuffer();
    } finally { clearTimeout(timer); }
  }

  private bufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  async generateImage(prompt: string, options?: { model?: string; width?: number; height?: number; negativePrompt?: string; numInferenceSteps?: number; guidanceScale?: number; seed?: number }): Promise<HfImageResult> {
    const start = Date.now();
    const model = options?.model || 'stabilityai/stable-diffusion-3.5-large-turbo';
    const parameters: Record<string, unknown> = {
      ...(options?.negativePrompt ? { negative_prompt: options.negativePrompt } : {}),
      num_inference_steps: options?.numInferenceSteps || 4,
      guidance_scale: options?.guidanceScale || 3.5,
      ...(options?.seed !== undefined ? { seed: options.seed } : {}),
    };
    const buffer = await this.requestBinary({ model, inputs: prompt, parameters, timeoutMs: 120000 });
    const base64 = this.bufferToBase64(buffer);
    return { imageUrl: `data:image/png;base64,${base64}`, base64, model, durationMs: Date.now() - start, seed: options?.seed };
  }

  async generateAudio(prompt: string, options?: { model?: string; duration?: number }): Promise<HfAudioResult> {
    const start = Date.now();
    const model = options?.model || 'facebook/musicgen-small';
    const parameters: Record<string, unknown> = { max_new_tokens: options?.duration ? Math.round(options.duration * 50) : 256 };
    const buffer = await this.requestBinary({ model, inputs: prompt, parameters, timeoutMs: 180000 });
    const base64 = this.bufferToBase64(buffer);
    return { audioUrl: `data:audio/wav;base64,${base64}`, durationMs: Date.now() - start, sampleRate: 16000, format: 'wav' };
  }

  async generateText(prompt: string, options?: { model?: string; maxTokens?: number; temperature?: number; topP?: number; topK?: number; repetitionPenalty?: number }): Promise<HfTextResult> {
    const start = Date.now();
    const model = options?.model || 'HuggingFaceH4/zephyr-7b-beta';
    const response = await this.requestJson<Array<{ generated_text: string }>>({
      model, inputs: prompt,
      parameters: { max_new_tokens: options?.maxTokens || 512, temperature: options?.temperature || 0.7, top_p: options?.topP || 0.95, top_k: options?.topK || 50, repetition_penalty: options?.repetitionPenalty || 1.0, return_full_text: false },
      waitForModel: true, useCache: true, timeoutMs: 60000,
    });
    return { text: response[0]?.generated_text || '', model, durationMs: Date.now() - start };
  }

  async translate(text: string, sourceLang: string, targetLang: string, options?: { model?: string }): Promise<HfTextResult> {
    return this.generateText(text, { model: options?.model || 'facebook/nllb-200-distilled-600M', maxTokens: 1024, temperature: 0.3, repetitionPenalty: 1.2 });
  }

  async summarize(text: string, options?: { model?: string; maxLength?: number; minLength?: number }): Promise<HfTextResult> {
    const start = Date.now();
    const model = options?.model || 'facebook/bart-large-cnn';
    const response = await this.requestJson<Array<{ summary_text: string }>>({
      model, inputs: text,
      parameters: { max_length: options?.maxLength || 150, min_length: options?.minLength || 40 },
      waitForModel: true, useCache: true, timeoutMs: 60000,
    });
    return { text: response[0]?.summary_text || '', model, durationMs: Date.now() - start };
  }

  async textToSpeech(text: string, options?: { model?: string }): Promise<HfAudioResult> {
    return this.generateAudio(text, { model: options?.model || 'espnet/kan-bayashi_ljspeech_vits' });
  }

  getAvailableModels() {
    return {
      image: [{ id: 'stabilityai/stable-diffusion-3.5-large-turbo', type: 'text-to-image', cost: 'free', quality: 'high' },
        { id: 'black-forest-labs/FLUX.1-schnell', type: 'text-to-image', cost: 'free', quality: 'high' },
        { id: 'runwayml/stable-diffusion-v1-5', type: 'text-to-image', cost: 'free', quality: 'medium' }],
      audio: [{ id: 'facebook/musicgen-small', type: 'text-to-audio', cost: 'free', quality: 'medium' },
        { id: 'espnet/kan-bayashi_ljspeech_vits', type: 'text-to-speech', cost: 'free', quality: 'high' },
        { id: 'suno/bark', type: 'text-to-speech', cost: 'free', quality: 'high' }],
      text: [{ id: 'mistralai/Mistral-7B-Instruct-v0.3', type: 'text-generation', cost: 'free', quality: 'high' },
        { id: 'HuggingFaceH4/zephyr-7b-beta', type: 'text-generation', cost: 'free', quality: 'medium' },
        { id: 'facebook/bart-large-cnn', type: 'summarization', cost: 'free', quality: 'high' },
        { id: 'facebook/nllb-200-distilled-600M', type: 'translation', cost: 'free', quality: 'high' }],
    };
  }
}

export function createHuggingFaceClient(): HuggingFaceClient { return new HuggingFaceClient(); }
export const hfClient = new HuggingFaceClient();
