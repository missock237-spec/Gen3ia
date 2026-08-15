import { createLogger } from '@/lib/logger';
import { createHuggingFaceClient } from '@/lib/generation/huggingface-client';

const log = createLogger('tts');

export interface TTSOptions {
  text: string;
  voice?: string;
  speed?: number;
  pitch?: number;
  language?: string;
  provider?: 'openai' | 'elevenlabs' | 'huggingface' | 'edge';
}

export interface TTSResult {
  audioUrl: string;
  durationMs: number;
  provider: string;
  format: string;
  text: string;
}

// Cache audio simple (en mémoire)
const audioCache = new Map<string, { audioUrl: string; expiresAt: number }>();
const CACHE_TTL = 3600 * 1000; // 1 heure

const MAX_TEXT_LENGTH = 4096;
const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;

async function callOpenAITTS(text: string, voice: string, speed: number): Promise<TTSResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set for TTS');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: voice || 'alloy',
        speed: Math.min(4.0, Math.max(0.25, speed)),
        response_format: 'mp3',
      }),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`OpenAI TTS error: status ${res.status}`);

    const audioBuffer = await res.arrayBuffer();
    const bytes = new Uint8Array(audioBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);

    return {
      audioUrl: `data:audio/mp3;base64,${base64}`,
      durationMs: Math.round(text.length * 60), // ~60ms par caractère
      provider: 'openai',
      format: 'mp3',
      text,
    };
  } finally {
    clearTimeout(timer);
  }
}

import { validatePathSegment } from '@/lib/security/validate-url';

async function callElevenLabsTTS(text: string, voice: string): Promise<TTSResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set');

  const voiceId = voice || '21m00Tcm4TlvDq8ikWAM';
  if (!validatePathSegment(voiceId)) throw new Error('Invalid voice ID'); // Rachel (voix par défaut)
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`ElevenLabs TTS error: status ${res.status}`);

    const audioBuffer = await res.arrayBuffer();
    const bytes = new Uint8Array(audioBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);

    return {
      audioUrl: `data:audio/mp3;base64,${base64}`,
      durationMs: Math.round(text.length * 50),
      provider: 'elevenlabs',
      format: 'mp3',
      text,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function callHuggingFaceTTS(text: string): Promise<TTSResult> {
  const hf = createHuggingFaceClient();
  const result = await hf.textToSpeech(text, {
    model: 'espnet/kan-bayashi_ljspeech_vits',
  });
  return {
    audioUrl: result.audioUrl,
    durationMs: result.durationMs,
    provider: 'huggingface',
    format: 'wav',
    text,
  };
}

async function callEdgeTTS(text: string, _language: string): Promise<TTSResult> {
  // Synthèse vocale via Web Speech API (côté client)
  // Sur le serveur, fallback vers HuggingFace
  return callHuggingFaceTTS(text);
}

export async function synthesizeSpeech(options: TTSOptions): Promise<TTSResult> {
  const { text, voice, speed = 1.0, _pitch = 1.0, language = 'en-US', provider } = options;

  if (!text || text.length === 0) {
    throw new Error('Le texte à synthétiser est vide');
  }

  // BUGFIX: on ne réassigne jamais `text` (const) — on calcule une version tronquée,
  // ce qui fait que la troncature est réellement appliquée aux appels providers.
  const truncatedText = text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text;
  if (text.length > MAX_TEXT_LENGTH) {
    log.warn('Texte tronqué pour TTS', { originalLength: text.length, maxLength: MAX_TEXT_LENGTH });
  }

  // Vérification du cache
  const cacheKey = `${provider || 'auto'}:${voice || 'default'}:${speed}:${truncatedText.slice(0, 100)}`;
  const cached = audioCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    log.info('TTS cache hit', { provider, textLength: truncatedText.length });
    return {
      audioUrl: cached.audioUrl,
      durationMs: Math.round(truncatedText.length * 50),
      provider: provider || 'cache',
      format: 'mp3',
      text: truncatedText,
    };
  }

  const startTime = Date.now();
  let result: TTSResult;

  const providers = provider
    ? [provider]
    : ['openai', 'elevenlabs', 'huggingface', 'edge'];

  let lastError: unknown;
  for (const p of providers) {
    try {
      switch (p) {
        case 'openai':
          if (process.env.OPENAI_API_KEY) {
            result = await callOpenAITTS(truncatedText, voice || 'alloy', speed);
            break;
          }
          continue;
        case 'elevenlabs':
          if (process.env.ELEVENLABS_API_KEY) {
            result = await callElevenLabsTTS(truncatedText, voice || '21m00Tcm4TlvDq8ikWAM');
            break;
          }
          continue;
        case 'huggingface':
          if (process.env.HUGGINGFACE_TOKEN) {
            result = await callHuggingFaceTTS(truncatedText);
            break;
          }
          continue;
        case 'edge':
          result = await callEdgeTTS(truncatedText, language);
          break;
        default:
          continue;
      }

      // Mise en cache
      audioCache.set(cacheKey, { audioUrl: result.audioUrl, expiresAt: Date.now() + CACHE_TTL });

      log.info('TTS synthesized', {
        provider: result.provider,
        textLength: truncatedText.length,
        durationMs: Date.now() - startTime,
      });

      return result;
    } catch (error) {
      lastError = error;
      log.warn(`TTS provider ${p} failed`, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  throw lastError || new Error('Tous les providers TTS ont échoué');
}

export async function getAvailableVoices(): Promise<Record<string, { id: string; name: string; provider: string }[]>> {
  return {
    openai: OPENAI_VOICES.map(v => ({ id: v, name: v.charAt(0).toUpperCase() + v.slice(1), provider: 'openai' })),
    elevenlabs: [
      { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', provider: 'elevenlabs' },
      { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', provider: 'elevenlabs' },
      { id: 'EXAVITQu4vrVxn15xGnx', name: 'Bella', provider: 'elevenlabs' },
      { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Antoni', provider: 'elevenlabs' },
    ],
    huggingface: [
      { id: 'default', name: 'LJ Speech (VITS)', provider: 'huggingface' },
      { id: 'suno/bark', name: 'Bark (Suno)', provider: 'huggingface' },
    ],
  };
}
