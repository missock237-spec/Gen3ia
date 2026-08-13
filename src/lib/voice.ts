// ============================================================
// VOICE — Service de synthèse et reconnaissance vocale (Hugging Face gratuit)
// ============================================================

import { queryHF, bufferToBase64 } from "./huggingface";
import { logger } from "./logger";

interface TTSOptions {
  voice?: string;
  model?: string;
  speed?: number;
  responseFormat?: string;
  language?: string;
}

interface TTSResult {
  audioBuffer: Buffer;
  duration: number;
  format: string;
  size: number;
}

interface STTOptions {
  model?: string;
  language?: string;
}

interface STTResult {
  text: string;
  confidence: number;
  duration: number;
}

export class TTSEngine {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  async synthesize(text: string, options: TTSOptions = {}): Promise<TTSResult> {
    const modelId = "facebook/mms-tts-fra";

    const response = await queryHF(modelId, { inputs: text });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`TTS HF error (${response.status}): ${err.slice(0, 200)}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const duration = text.length * 0.08; // Estimation ~80ms par caractère

    return {
      audioBuffer: buffer,
      duration,
      format: options.responseFormat ?? "wav",
      size: buffer.length,
    };
  }
}

export class STTEngine {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  async transcribe(audioBase64: string, options: STTOptions = {}): Promise<STTResult> {
    const modelId = "openai/whisper-small";
    const audioBuffer = Buffer.from(audioBase64, "base64");

    const response = await queryHF(modelId, {
      inputs: audioBuffer,
      parameters: {
        language: options.language ?? "fr",
        return_timestamps: true,
      },
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`STT HF error (${response.status}): ${err.slice(0, 200)}`);
    }

    const result = await response.json() as { text?: string; chunks?: Array<{ text: string; timestamp: [number, number] }> };

    return {
      text: result.text ?? "",
      confidence: 0.85,
      duration: 0,
    };
  }
}

export function createTTSEngine(userId: string): TTSEngine {
  return new TTSEngine(userId);
}

export function createSTTEngine(userId: string): STTEngine {
  return new STTEngine(userId);
}

// Re-export from voice submodules for backward compatibility
export { getVoiceAgentEngine as createVoiceAgent, VoiceAgentEngine } from './voice/voice-agent';
export { VoiceMemorySystem as createVoiceMemory } from './voice/voice-memory';

/**
 * Create an AI call system that integrates voice agent and memory.
 * userId is optional — passes through to the underlying voice agent engine.
 */
export function createAICallSystem(userId?: string) {
  const engine = getVoiceAgentEngine();
  return {
    tts: new TTSEngine(userId || 'anonymous'),
    stt: new STTEngine(userId || 'anonymous'),
    /** List calls for a user — delegates to VoiceAgentEngine. */
    async listCalls(uid: string, options: { status?: string; limit?: number; offset?: number } = {}) {
      const calls = engine.getActiveCallsByUser(uid);
      const filtered = options.status ? calls.filter((c) => c.status === options.status) : calls;
      const limit = options.limit || 50;
      const offset = options.offset || 0;
      return {
        calls: filtered.slice(offset, offset + limit),
        total: filtered.length,
      };
    },
    /** Initiate a call — delegates to VoiceAgentEngine. */
    async initiateCall(config: { userId: string; to: string; from?: string }) {
      return engine.initiateCall(config);
    },
  };
}