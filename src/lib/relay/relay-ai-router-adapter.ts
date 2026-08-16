import { createLogger } from '@/lib/logger';
import { relayChat, relaySynthesizeSpeech, relayGenerateImage, relayGenerateVideo, relayGenerateAudio, getRelayStatus } from '@/lib/relay/relay-router';
import { AIRouter, AIMessage, AIResponse, createAIRouter } from '@/lib/ai-router';

const log = createLogger('relay-ai-adapter');

export class RelayAIAgent {
  private router: AIRouter;

  constructor(userId: string) {
    this.router = createAIRouter(userId);
  }

  async chat(
    messages: AIMessage[],
    options?: { model?: 'default' | 'fast' | 'powerful'; provider?: string; preferFree?: boolean; maxBudget?: number }
  ): Promise<AIResponse> {
    const preferFree = options?.preferFree ?? true;
    const useRelayFirst = preferFree;

    if (useRelayFirst) {
      try {
        log.info('RelayAI: tentative via relay system');
        const result = await relayChat(messages, { preferFree });
        log.info('RelayAI: relay system a reussi', {
          provider: result.provider,
          model: result.model,
          costUsd: result.costUsd,
        });
        return result;
      } catch (relayError) {
        log.warn('RelayAI: relay echoue, fallback AI Router direct', {
          error: relayError instanceof Error ? relayError.message : String(relayError),
        });
      }
    }

    return this.router.chat(messages, { model: options?.model, provider: options?.provider });
  }

  async *chatStream(
    messages: AIMessage[],
    options?: { model?: 'default' | 'fast' | 'powerful' }
  ): AsyncGenerator<{ delta: string; done: boolean; content?: string }> {
    const result = await this.chat(messages, options);
    yield { delta: result.content, done: false };
    yield { delta: '', done: true, content: result.content };
  }

  async synthesizeSpeech(text: string, language?: string): Promise<{ audioUrl: string; provider: string; isFree: boolean }> {
    log.info('RelayAI: synthese vocale via relay');
    return relaySynthesizeSpeech(text, language || 'en-US');
  }

  async generateImage(prompt: string): Promise<{ imageUrl: string; provider: string; isFree: boolean }> {
    log.info('RelayAI: generation image via relay');
    return relayGenerateImage(prompt);
  }

  async generateVideo(prompt: string): Promise<{ videoUrl: string; provider: string; isFree: boolean }> {
    log.info('RelayAI: generation video via relay');
    return relayGenerateVideo(prompt);
  }

  async generateAudio(prompt: string): Promise<{ audioUrl: string; provider: string; isFree: boolean }> {
    log.info('RelayAI: generation audio via relay');
    return relayGenerateAudio(prompt);
  }

  async getRelayStatus() {
    return getRelayStatus();
  }
}

export function createRelayAIAgent(userId: string): RelayAIAgent {
  return new RelayAIAgent(userId);
}