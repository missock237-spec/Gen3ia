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
 * Create an AI call system that integrates voice agent and memory
 */
export function createAICallSystem(userId: string) {
  return {
    tts: new TTSEngine(userId),
    stt: new STTEngine(userId),
  };
}