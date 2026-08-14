import { HfInference } from '@huggingface/inference';

/**
 * Advanced Text-To-Speech using Hugging Face Free Models
 * Supports multiple languages, emotions, and voice characteristics
 */

export interface TTSOptions {
  language?: string; // 'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'zh', 'ja', 'ko'
  emotion?: 'neutral' | 'happy' | 'sad' | 'angry' | 'calm';
  speed?: number; // 0.5-2.0 (default: 1.0)
  pitch?: number; // 0.5-2.0 (default: 1.0)
  voiceId?: string; // For voice cloning
  speakerId?: string; // Preset speaker
}

export interface TTSResult {
  audio: Buffer | Uint8Array;
  mimeType: 'audio/wav' | 'audio/mp3' | 'audio/flac';
  duration: number;
  sampleRate: number;
  channels: number;
}

class HuggingFaceTTS {
  private client: HfInference;
  private readonly apiKey: string;

  // Hugging Face free models for TTS
  private readonly models = {
    // Multi-language MMS (Massively Multilingual Speech) - BEST FOR FREE
    mms: 'facebook/mms-tts',

    // Bark - Good for emotional TTS
    bark: 'suno/bark',

    // Glow-TTS - Fast and high-quality (text input only)
    glowTts: 'glow-tts',
  };

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.HUGGINGFACE_API_KEY || '';
    this.client = new HfInference(this.apiKey);
  }

  /**
   * Generate speech from text using Hugging Face models
   */
  async synthesize(text: string, options: TTSOptions = {}): Promise<TTSResult> {
    const language = options.language || 'en';
    const emotion = options.emotion || 'neutral';

    try {
      // Use Bark model for better emotion support
      if (emotion !== 'neutral' || options.voiceId) {
        return this.synthesizeWithBark(text, options);
      }

      // Use MMS for multilingual support
      return this.synthesizeWithMMS(text, language);
    } catch (error) {
      console.error('[TTS] Synthesis error:', error);
      throw new Error(`Text-to-speech synthesis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Synthesize using Bark model (emotional TTS)
   */
  private async synthesizeWithBark(text: string, options: TTSOptions): Promise<TTSResult> {
    const voicePresets = this.getVoicePreset(options.emotion || 'neutral', options.speakerId);

    const audioStream = await this.client.textToSpeech({
      model: this.models.bark,
      inputs: text,
      data: {
        voice_preset: voicePresets[0], // Use first preset
      },
    });

    return this.processAudioStream(audioStream);
  }

  /**
   * Synthesize using MMS for multilingual support
   */
  private async synthesizeWithMMS(text: string, language: string): Promise<TTSResult> {
    // Map language codes to MMS format
    const languageMap: Record<string, string> = {
      en: 'eng',
      es: 'spa',
      fr: 'fra',
      de: 'deu',
      it: 'ita',
      pt: 'por',
      nl: 'nld',
      ru: 'rus',
      zh: 'zho',
      ja: 'jpn',
      ko: 'kor',
    };

    const mmsLanguage = languageMap[language] || 'eng';

    const audioStream = await this.client.textToSpeech({
      model: `facebook/mms-tts-${mmsLanguage}`,
      inputs: text,
    });

    return this.processAudioStream(audioStream);
  }

  /**
   * Get voice preset based on emotion
   */
  private getVoicePreset(emotion: string, speakerId?: string): string[] {
    const presets: Record<string, string[]> = {
      neutral: ['v2/en_speaker_5', 'v2/en_speaker_3'],
      happy: ['v2/en_speaker_0', 'v2/en_speaker_1'],
      sad: ['v2/en_speaker_2', 'v2/en_speaker_4'],
      angry: ['v2/en_speaker_6', 'v2/en_speaker_7'],
      calm: ['v2/en_speaker_5', 'v2/en_speaker_8'],
    };

    if (speakerId) {
      return [speakerId];
    }

    return presets[emotion] || presets.neutral;
  }

  /**
   * Process audio stream from Hugging Face API
   */
  private async processAudioStream(stream: ReadableStream<Uint8Array>): Promise<TTSResult> {
    const chunks: Uint8Array[] = [];
    const reader = stream.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    const audioBuffer = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      audioBuffer.set(chunk, offset);
      offset += chunk.length;
    }

    // Parse audio metadata
    const { sampleRate, channels, duration } = this.parseAudioMetadata(audioBuffer);

    return {
      audio: Buffer.from(audioBuffer),
      mimeType: 'audio/wav',
      duration,
      sampleRate,
      channels,
    };
  }

  /**
   * Parse WAV audio metadata
   */
  private parseAudioMetadata(audioBuffer: Uint8Array): { sampleRate: number; channels: number; duration: number } {
    // WAV header format
    let sampleRate = 22050;
    let channels = 1;
    let duration = 0;

    try {
      if (audioBuffer.length > 24) {
        // Read sample rate from WAV header (bytes 24-27)
        sampleRate = new DataView(audioBuffer.buffer).getUint32(24, true);

        // Read channels (bytes 8-9)
        channels = new DataView(audioBuffer.buffer).getUint16(8, true);

        // Calculate duration
        const byteRate = new DataView(audioBuffer.buffer).getUint32(28, true);
        const audioDataSize = audioBuffer.length - 44; // Subtract header
        duration = audioDataSize / byteRate;
      }
    } catch (error) {
      console.warn('[TTS] Could not parse audio metadata, using defaults');
    }

    return { sampleRate, channels, duration };
  }

  /**
   * Batch synthesize multiple texts
   */
  async synthesizeBatch(texts: string[], options: TTSOptions = {}): Promise<TTSResult[]> {
    const results: TTSResult[] = [];

    for (const text of texts) {
      try {
        const result = await this.synthesize(text, options);
        results.push(result);
      } catch (error) {
        console.error(`[TTS] Failed to synthesize: "${text}"`, error);
        // Continue with next text
      }
    }

    return results;
  }

  /**
   * Estimate synthesis time before generating
   */
  estimateSynthesisTime(textLength: number): number {
    // Rough estimation: ~1 minute per 1000 characters
    // With some overhead
    return Math.ceil((textLength / 1000) * 60 * 1000) + 2000; // in milliseconds
  }
}

// Singleton instance
let ttsSingleton: HuggingFaceTTS | null = null;

/**
 * Get or create TTS instance
 */
export function getTTSClient(): HuggingFaceTTS {
  if (!ttsSingleton) {
    ttsSingleton = new HuggingFaceTTS();
  }
  return ttsSingleton;
}

/**
 * Helper function to synthesize text
 */
export async function synthesizeText(text: string, options?: TTSOptions): Promise<TTSResult> {
  const tts = getTTSClient();
  return tts.synthesize(text, options);
}

/**
 * Helper function for batch synthesis
 */
export async function synthesizeTextBatch(texts: string[], options?: TTSOptions): Promise<TTSResult[]> {
  const tts = getTTSClient();
  return tts.synthesizeBatch(texts, options);
}

/**
 * Validate language support
 */
export function isLanguageSupported(language: string): boolean {
  const supported = ['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'zh', 'ja', 'ko'];
  return supported.includes(language.toLowerCase());
}

/**
 * Get available voices/presets
 */
export function getAvailableVoices(): Record<string, string[]> {
  return {
    neutral: ['v2/en_speaker_5', 'v2/en_speaker_3'],
    happy: ['v2/en_speaker_0', 'v2/en_speaker_1'],
    sad: ['v2/en_speaker_2', 'v2/en_speaker_4'],
    angry: ['v2/en_speaker_6', 'v2/en_speaker_7'],
    calm: ['v2/en_speaker_5', 'v2/en_speaker_8'],
  };
}
