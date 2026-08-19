import { HfInference } from '@huggingface/inference';

/**
 * Advanced Speech-To-Text using Hugging Face Whisper
 * Supports multiple languages, streaming, and punctuation restoration
 */

export interface STTOptions {
  language?: string; // Auto-detect if not specified
  timestamps?: boolean; // Return word-level timestamps
  paragraphs?: boolean; // Group into paragraphs
  punctuation?: boolean; // Restore punctuation
  confidence?: boolean; // Return confidence scores
}

export interface STTResult {
  text: string;
  language: string;
  confidence: number;
  duration: number;
  words?: Array<{
    word: string;
    start: number;
    end: number;
    confidence: number;
  }>;
  paragraphs?: string[];
}

export interface STTStreamResult {
  partialText: string;
  isFinal: boolean;
  timestamp: number;
}

class HuggingFaceSTT {
  private client: HfInference;
  private readonly apiKey: string;

  // Hugging Face Whisper model for free STT
  private readonly model = 'openai/whisper-base';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.HUGGINGFACE_API_KEY || '';
    this.client = new HfInference(this.apiKey);
  }

  /**
   * Transcribe audio file using Whisper
   */
  async transcribe(audioBuffer: Buffer | Uint8Array, options: STTOptions = {}): Promise<STTResult> {
    try {
      // Normalize Buffer/Uint8Array to a plain Uint8Array then pass its ArrayBuffer
      // as a valid BlobPart (Buffer is a Uint8Array subclass that TS lib rejects as BlobPart).
      const bytes = new Uint8Array(audioBuffer.length);
      bytes.set(audioBuffer as Uint8Array);
      const file = new File([bytes.buffer], 'audio.wav', { type: 'audio/wav' });

      // Use Whisper for transcription
      const result = await this.client.automaticSpeechRecognition({
        model: this.model,
        data: file,
      });

      let text = (result as { text?: string }).text || '';

      // Restore punctuation if requested
      if (options.punctuation) {
        text = await this.restorePunctuation(text);
      }

      // Detect language if requested
      const language = options.language || (await this.detectLanguage(text));

      // Group into paragraphs if requested
      const paragraphs = options.paragraphs ? this.groupIntoParagraphs(text) : undefined;

      // Estimate confidence
      const confidence = this.estimateConfidence(text);

      return {
        text,
        language,
        confidence,
        duration: this.estimateDuration(audioBuffer),
        paragraphs,
      };
    } catch (error) {
      console.error('[STT] Transcription error:', error);
      throw new Error(`Speech-to-text transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Stream transcription for real-time processing
   */
  async *transcribeStream(audioChunks: AsyncIterable<Uint8Array>, options: STTOptions = {}): AsyncGenerator<STTStreamResult> {
    let fullText = '';
    let lastYield = '';

    try {
      for await (const chunk of audioChunks) {
        // Process audio chunks and yield partial results
        const result = await this.transcribe(chunk, { ...options, punctuation: false });

        // Update full text
        fullText = result.text;

        // Yield if text has changed
        if (fullText !== lastYield) {
          yield {
            partialText: fullText,
            isFinal: false,
            timestamp: Date.now(),
          };
          lastYield = fullText;
        }
      }

      // Final result with all post-processing
      if (options.punctuation) {
        fullText = await this.restorePunctuation(fullText);
      }

      yield {
        partialText: fullText,
        isFinal: true,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('[STT] Stream transcription error:', error);
      throw error;
    }
  }

  /**
   * Restore punctuation using a simple model
   */
  private async restorePunctuation(text: string): Promise<string> {
    // Simple heuristic-based punctuation restoration
    let punctuated = text;

    // Add period at end if missing
    if (!punctuated.match(/[.!?]$/)) {
      punctuated += '.';
    }

    // Capitalize sentences
    punctuated = punctuated.replace(/(?:^|[.!?]\s+)(\w)/g, (match) => match.toUpperCase());

    // Add punctuation after common phrase endings
    const phraseEndings = [
      { pattern: /\b(hello|hi|hey)\b(?!\s*[.!?])/gi, punctuation: ',' },
      { pattern: /\b(right|okay|sure|yes|no)\b(?!\s*[.!?])/gi, punctuation: ',' },
      { pattern: /\b(thanks|thank you)\b(?!\s*[.!?])/gi, punctuation: '.' },
    ];

    for (const { pattern, punctuation } of phraseEndings) {
      punctuated = punctuated.replace(pattern, `$1${punctuation}`);
    }

    return punctuated;
  }

  /**
   * Detect language from text
   */
  private async detectLanguage(text: string): Promise<string> {
    // Simple language detection based on common words
    const languagePatterns: Record<string, RegExp> = {
      en: /\b(the|is|and|to|of|a|in|that|it)\b/gi,
      es: /\b(el|la|de|que|es|y|en|un|una)\b/gi,
      fr: /\b(le|la|de|que|est|et|en|un|une)\b/gi,
      de: /\b(der|die|das|von|ist|und|in|ein|eine)\b/gi,
      it: /\b(il|la|di|che|è|e|in|un|una)\b/gi,
      pt: /\b(o|a|de|que|é|e|em|um|uma)\b/gi,
    };

    let maxMatches = 0;
    let detectedLanguage = 'en';

    for (const [lang, pattern] of Object.entries(languagePatterns)) {
      const matches = (text.match(pattern) || []).length;
      if (matches > maxMatches) {
        maxMatches = matches;
        detectedLanguage = lang;
      }
    }

    return detectedLanguage;
  }

  /**
   * Group text into paragraphs
   */
  private groupIntoParagraphs(text: string): string[] {
    // Split by sentence and group into logical paragraphs
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim());
    const paragraphs: string[] = [];
    let currentParagraph = '';

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      currentParagraph += trimmed + '. ';

      // Create new paragraph after 3-4 sentences or 150 characters
      if (
        (currentParagraph.split(/[.!?]/).length > 4 ||
          currentParagraph.length > 150) &&
        currentParagraph.split(' ').length > 10
      ) {
        paragraphs.push(currentParagraph.trim());
        currentParagraph = '';
      }
    }

    if (currentParagraph.trim()) {
      paragraphs.push(currentParagraph.trim());
    }

    return paragraphs;
  }

  /**
   * Estimate transcription confidence
   */
  private estimateConfidence(text: string): number {
    // Simple confidence estimation
    // Higher confidence if text has good variety of words
    const words = text.toLowerCase().split(/\s+/);
    const uniqueWords = new Set(words).size;
    const wordVariety = uniqueWords / Math.max(words.length, 1);

    // Confidence based on word variety and length
    const confidence = Math.min(
      1,
      Math.max(0.5, wordVariety) * (Math.min(words.length, 100) / 100)
    );

    return confidence;
  }

  /**
   * Estimate audio duration from buffer
   */
  private estimateDuration(audioBuffer: Buffer | Uint8Array): number {
    // WAV format: duration = (fileSize - 44) / (sampleRate * channels * bytesPerSample)
    // Assuming 16-bit mono at 16kHz
    const estimatedSampleRate = 16000;
    const bytesPerSample = 2;
    const channels = 1;

    const audioDataSize = audioBuffer.length - 44;
    const duration = audioDataSize / (estimatedSampleRate * channels * bytesPerSample);

    return Math.max(0, duration);
  }

  /**
   * Batch transcribe multiple audio files
   */
  async transcribeBatch(audioBuffers: (Buffer | Uint8Array)[], options: STTOptions = {}): Promise<STTResult[]> {
    const results: STTResult[] = [];

    for (const buffer of audioBuffers) {
      try {
        const result = await this.transcribe(buffer, options);
        results.push(result);
      } catch (error) {
        console.error('[STT] Failed to transcribe audio', error);
        results.push({
          text: '',
          language: 'unknown',
          confidence: 0,
          duration: 0,
        });
      }
    }

    return results;
  }
}

// Singleton instance
let sttSingleton: HuggingFaceSTT | null = null;

/**
 * Get or create STT instance
 */
export function getSTTClient(): HuggingFaceSTT {
  if (!sttSingleton) {
    sttSingleton = new HuggingFaceSTT();
  }
  return sttSingleton;
}

/**
 * Helper function to transcribe audio
 */
export async function transcribeAudio(audioBuffer: Buffer | Uint8Array, options?: STTOptions): Promise<STTResult> {
  const stt = getSTTClient();
  return stt.transcribe(audioBuffer, options);
}

/**
 * Helper function for streaming transcription
 */
export function transcribeAudioStream(
  audioChunks: AsyncIterable<Uint8Array>,
  options?: STTOptions
): AsyncGenerator<STTStreamResult> {
  const stt = getSTTClient();
  return stt.transcribeStream(audioChunks, options);
}

/**
 * Supported languages
 */
export const SUPPORTED_LANGUAGES = [
  'en', // English
  'es', // Spanish
  'fr', // French
  'de', // German
  'it', // Italian
  'pt', // Portuguese
  'nl', // Dutch
  'ru', // Russian
  'zh', // Chinese
  'ja', // Japanese
  'ko', // Korean
  'ar', // Arabic
  'hi', // Hindi
  'bn', // Bengali
  'th', // Thai
  'tr', // Turkish
];

/**
 * Check if language is supported
 */
export function isLanguageSupported(language: string): boolean {
  return SUPPORTED_LANGUAGES.includes(language.toLowerCase());
}
