/**
 * Voice AI System — Genova SaaS
 *
 * Central export point for the Voice AI layer.
 * Provides factory functions and unified access to:
 *   - STT (Speech-to-Text)
 *   - TTS (Text-to-Speech)
 *   - Voice Agent (conversational AI)
 *   - Voice Memory (persistent voice memories)
 *   - AI Calls (phone call automation)
 */

// Re-export all modules (BUGFIX: exports resynchronisés avec les
// implémentations réelles — TextToSpeechEngine et VoiceAgent n'existaient pas)
export { SpeechToTextEngine, type STTResult, type STTOptions } from './stt';
export { synthesizeSpeech, getAvailableVoices, type TTSResult, type TTSOptions } from './tts';
export {
  VoiceAgentEngine,
  getVoiceAgentEngine,
  type VoiceAgentConfig,
  type CallState,
  type CallAction,
  type TranscriptEntry,
  type CallStatus,
  type CallDirection,
} from './voice-agent';
export { VoiceMemorySystem, type VoiceMemoryEntry } from './voice-memory';
export { AICallSystem, type AICallConfig, type AICallSession } from './ai-calls';

import { SpeechToTextEngine } from './stt';
import { synthesizeSpeech, type TTSOptions, type TTSResult } from './tts';
import { VoiceAgentEngine, getVoiceAgentEngine } from './voice-agent';
import { VoiceMemorySystem } from './voice-memory';
import { AICallSystem } from './ai-calls';

// ---------------------------------------------------------------------------
// Compatibilité : ancienne API TextToSpeechEngine (classe) par-dessus synthesizeSpeech
// ---------------------------------------------------------------------------
export class TextToSpeechEngine {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  async synthesize(options: TTSOptions): Promise<TTSResult> {
    return synthesizeSpeech(options);
  }
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

/**
 * Create a SpeechToTextEngine for a user
 */
export function createSTTEngine(userId: string): SpeechToTextEngine {
  return new SpeechToTextEngine(userId);
}

/**
 * Create a TextToSpeechEngine for a user
 */
export function createTTSEngine(userId: string): TextToSpeechEngine {
  return new TextToSpeechEngine(userId);
}

/**
 * Create (or get the singleton) VoiceAgentEngine — l'engine vocal gère
 * les appels Twilio ; le paramètre userId est accepté par compatibilité.
 */
export function createVoiceAgent(userId?: string): VoiceAgentEngine {
  return getVoiceAgentEngine();
}

/**
 * Create a VoiceMemorySystem (userId est passé par compatibilité,
 * les méthodes prennent le userId en argument).
 */
export function createVoiceMemory(userId?: string): VoiceMemorySystem {
  return new VoiceMemorySystem();
}

/**
 * Create an AICallSystem instance
 */
export function createAICallSystem(): AICallSystem {
  return new AICallSystem();
}

// ---------------------------------------------------------------------------
// Initialization check
// ---------------------------------------------------------------------------

export interface VoiceSystemStatus {
  stt: { available: boolean; providers: string[] };
  tts: { available: boolean; providers: string[] };
  agent: { available: boolean };
  memory: { available: boolean };
  calls: { available: boolean; providers: string[] };
}

/**
 * Get the current status of the voice system
 */
export function getVoiceSystemStatus(): VoiceSystemStatus {
  const sttProviders: string[] = [];
  if (process.env.GROQ_API_KEY) sttProviders.push('groq');
  if (process.env.OPENAI_API_KEY) sttProviders.push('openai');

  const ttsProviders: string[] = [];
  if (process.env.OPENAI_API_KEY) ttsProviders.push('openai');
  if (process.env.ELEVENLABS_API_KEY) ttsProviders.push('elevenlabs');
  if (process.env.HUGGINGFACE_TOKEN) ttsProviders.push('huggingface');

  const callProviders: string[] = [];
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    callProviders.push('twilio');
  }

  return {
    stt: {
      available: sttProviders.length > 0,
      providers: sttProviders,
    },
    tts: {
      available: ttsProviders.length > 0,
      providers: ttsProviders,
    },
    agent: { available: true },
    memory: { available: true },
    calls: {
      available: callProviders.length > 0,
      providers: callProviders,
    },
  };
}
