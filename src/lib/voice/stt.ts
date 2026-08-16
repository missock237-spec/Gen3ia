import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';

const log = createLogger('voice-stt');

export interface STTResult {
  text: string;
  language: string;
  confidence: number;
  duration: number;
  segments?: Array<{ text: string; start: number; end: number; confidence: number }>;
}

export interface STTOptions {
  language?: string;
  model?: 'whisper-1' | 'whisper-large-v3' | 'distil-whisper-large-v3-en';
  detectLanguage?: boolean;
  enableDiarization?: boolean;
}

async function transcribeGroq(audioBuffer: Buffer, options: STTOptions): Promise<STTResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');
  const model = options.model === 'distil-whisper-large-v3-en' ? 'distil-whisper-large-v3-en' : 'whisper-large-v3';
  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array(audioBuffer)], { type: 'audio/webm' }), 'audio.webm');
  formData.append('model', model);
  formData.append('response_format', 'verbose_json');
  if (options.language) formData.append('language', options.language);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: formData, signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Groq STT error: status ${res.status}`);
    const data = await res.json();
    return {
      text: data.text ?? '', language: data.language ?? options.language ?? 'en',
      confidence: data.segments?.length ? data.segments.reduce((s: number, seg: { avg_logprob?: number }) => s + (seg.avg_logprob ?? 0), 0) / data.segments.length : 0.85,
      duration: data.duration ?? 0,
      segments: data.segments?.map((seg: { text: string; start: number; end: number; avg_logprob?: number }) => ({ text: seg.text ?? '', start: seg.start ?? 0, end: seg.end ?? 0, confidence: Math.max(0, Math.min(1, (seg.avg_logprob ?? -0.3) + 1)) })),
    };
  } finally { clearTimeout(timer); }
}

async function transcribeOpenAI(audioBuffer: Buffer, options: STTOptions): Promise<STTResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');
  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array(audioBuffer)], { type: 'audio/webm' }), 'audio.webm');
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'verbose_json');
  if (options.language) formData.append('language', options.language);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: formData, signal: controller.signal,
    });
    if (!res.ok) throw new Error(`OpenAI STT error: status ${res.status}`);
    const data = await res.json();
    return {
      text: data.text ?? '', language: data.language ?? options.language ?? 'en',
      confidence: data.segments?.length ? data.segments.reduce((s: number, seg: { avg_logprob?: number }) => s + (seg.avg_logprob ?? 0), 0) / data.segments.length : 0.85,
      duration: data.duration ?? 0,
      segments: data.segments?.map((seg: { text: string; start: number; end: number; avg_logprob?: number }) => ({ text: seg.text ?? '', start: seg.start ?? 0, end: seg.end ?? 0, confidence: Math.max(0, Math.min(1, (seg.avg_logprob ?? -0.3) + 1)) })),
    };
  } finally { clearTimeout(timer); }
}

export class SpeechToTextEngine {
  private userId: string;
  constructor(userId: string) { this.userId = userId; }

  async transcribe(audioBuffer: Buffer, options: STTOptions = {}): Promise<STTResult> {
    const providers: Array<{ name: string; fn: () => Promise<STTResult> }> = [];
    // BUGFIX: Suppression des dépendances inexistantes (z-ai-web-dev-sdk, speechbrain-client, fluro-client)
    if (process.env.GROQ_API_KEY) providers.push({ name: 'groq', fn: () => transcribeGroq(audioBuffer, options) });
    if (process.env.OPENAI_API_KEY) providers.push({ name: 'openai', fn: () => transcribeOpenAI(audioBuffer, options) });
    // Fallback: Groq si disponible, sinon OpenAI
    if (!process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY) {
      providers.push({ name: 'openai', fn: () => transcribeOpenAI(audioBuffer, options) });
    }
    let lastError: unknown;
    for (const provider of providers) {
      try {
        const result = await provider.fn();
        log.info('STT transcription completed', { provider: provider.name, language: result.language, textLength: result.text.length });
        await this.recordSession(result, options, provider.name);
        return result;
      } catch (error) {
        lastError = error;
        log.warn(`STT provider ${provider.name} failed`, { error: String(error) });
      }
    }
    throw lastError ?? new Error('All STT providers failed. Set GROQ_API_KEY or OPENAI_API_KEY.');
  }

  async *transcribeStream(audioStream: AsyncIterable<Buffer>, options: STTOptions = {}): AsyncGenerator<STTResult> {
    const CHUNK_SIZE = 96000;
    let buffer = Buffer.alloc(0);
    for await (const chunk of audioStream) {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length >= CHUNK_SIZE) {
        try { yield await this.transcribe(buffer, options); buffer = Buffer.alloc(0); } catch { }
      }
    }
    if (buffer.length > 0) { try { yield await this.transcribe(buffer, options); } catch { } }
  }

  private async recordSession(result: STTResult, options: STTOptions, provider: string): Promise<void> {
    try {
      await db.voiceSession.create({
        data: {
          userId: this.userId, type: 'stt', status: 'ended', language: result.language,
          sttProvider: provider, transcription: result.text, durationSeconds: Math.round(result.duration),
          metadata: JSON.stringify({ confidence: result.confidence, segments: result.segments?.length ?? 0, model: options.model ?? 'default', detectLanguage: options.detectLanguage ?? false }),
          endedAt: new Date(),
        },
      });
    } catch (error) { log.warn('Failed to record STT session', { error: String(error) }); }
  }
}
