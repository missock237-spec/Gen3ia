/**
 * AI Router — Multi-provider AI router with fallback, retry, streaming,
 * cost estimation, and usage tracking.
 *
 * Providers (in priority order):
 * 1. Groq (direct REST) — rapide, grande limite, gratuit
 * 2. Gemini (Google) — fallback quand Groq est à sa limite, gratuit
 * 3. OpenRouter (direct REST) — dernier recours
 */

import ZAI from 'z-ai-web-dev-sdk';
import { createLogger } from '@/lib/logger';

const log = createLogger('ai-router');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIStreamChunk {
  delta: string;
  done: boolean;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AIResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  provider: string;
  model: string;
  costUsd: number;
}

export interface ProviderConfig {
  name: string;
  priority: number;
  models: {
    default: string;
    fast: string;
    powerful: string;
  };
}

export interface AIRouterConfig {
  providers: ProviderConfig[];
  maxRetries: number;
  retryDelayMs: number;
  timeoutMs: number;
}

export type ModelTier = 'default' | 'fast' | 'powerful';

export interface GenerateOptions {
  tier?: ModelTier;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

// ---------------------------------------------------------------------------
// Default configuration — Groq → Gemini → OpenRouter
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: AIRouterConfig = {
  providers: [
    {
      name: 'groq',
      priority: 1,
      models: {
        default: 'llama-3.3-70b-versatile',
        fast: 'llama-3.1-8b-instant',
        powerful: 'llama-3.3-70b-versatile',
      },
    },
    {
      name: 'gemini',
      priority: 2,
      models: {
        default: 'gemini-2.0-flash',
        fast: 'gemini-2.0-flash-lite',
        powerful: 'gemini-2.0-pro',
      },
    },
    {
      name: 'openrouter',
      priority: 3,
      models: {
        default: 'meta-llama/llama-3.1-8b-instruct:free',
        fast: 'meta-llama/llama-3.1-8b-instruct:free',
        powerful: 'meta-llama/llama-3.1-70b-instruct',
      },
    },
  ],
  maxRetries: 2,
  retryDelayMs: 500,
  timeoutMs: 60_000,
};

// ---------------------------------------------------------------------------
// Cost estimation
// ---------------------------------------------------------------------------

const COST_PER_K: Record<string, Record<string, { prompt: number; completion: number }>> = {
  groq: {
    default: { prompt: 0.00059, completion: 0.00079 },
    fast: { prompt: 0.00005, completion: 0.00008 },
    powerful: { prompt: 0.00059, completion: 0.00079 },
  },
  gemini: {
    default: { prompt: 0, completion: 0 },
    fast: { prompt: 0, completion: 0 },
    powerful: { prompt: 0, completion: 0 },
  },
};

function getCostPerK(
  provider: string,
  model: string,
): { prompt: number; completion: number } {
  if (provider === 'gemini') return { prompt: 0, completion: 0 };
  if (COST_PER_K[provider]?.[model]) return COST_PER_K[provider][model];
  return { prompt: 0, completion: 0 };
}

function estimateCost(
  provider: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const rates = getCostPerK(provider, model);
  return (promptTokens / 1000) * rates.prompt + (completionTokens / 1000) * rates.completion;
}

// ---------------------------------------------------------------------------
// Rate limit helpers
// ---------------------------------------------------------------------------

// Compteur simple pour détecter le rate limiting de Groq
const groqRateLimitTracker = {
  minuteStart: Date.now(),
  count: 0,
  reset() {
    this.minuteStart = Date.now();
    this.count = 0;
  },
  increment(): number {
    if (Date.now() - this.minuteStart > 60000) this.reset();
    this.count++;
    return this.count;
  },
};

const GROQ_RATE_LIMIT_PER_MINUTE = 30; // Limite gratuite Groq

function isTransientError(error: unknown): boolean {
  if (error instanceof Response) {
    const s = error.status;
    return s === 429 || (s >= 500 && s <= 599);
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    const statusMatch = msg.match(/status[:\s]*(\d{3})/);
    if (statusMatch) {
      const s = parseInt(statusMatch[1], 10);
      if (s >= 400 && s < 500 && s !== 429) return false;
      return s === 429 || (s >= 500 && s <= 599);
    }
    if (
      msg.includes('network') ||
      msg.includes('timeout') ||
      msg.includes('econnreset') ||
      msg.includes('econnrefused') ||
      msg.includes('rate limit') ||
      msg.includes('overloaded') ||
      msg.includes('quota') ||
      msg.includes('too many')
    ) return true;
    if (
      msg.includes('forbidden') ||
      msg.includes('unauthorized') ||
      msg.includes('invalid api key') ||
      msg.includes('authentication') ||
      msg.includes('api key not found')
    ) return false;
  }
  return false;
}

/**
 * Vérifie si Groq risque d'être rate limité
 * Si oui, on passe directement à Gemini sans attendre l'erreur 429
 */
function shouldSkipGroq(): boolean {
  const count = groqRateLimitTracker.increment();
  return count > GROQ_RATE_LIMIT_PER_MINUTE;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function generateRequestId(): string {
  return `ai_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Provider callers — non-streaming
// ---------------------------------------------------------------------------

interface ProviderCallResult {
  content: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  provider: string;
  model: string;
}

function abortRace(controller: AbortController, timeoutMs: number): Promise<never> {
  return new Promise((_, reject) => {
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    controller.signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    }, { once: true });
  });
}

// ===========================================================================
// Google Gemini API
// ===========================================================================

async function callGemini(
  messages: AIMessage[],
  model: string,
  timeoutMs: number,
): Promise<ProviderCallResult> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  // Convertir les messages au format Gemini
  const contents: { role: string; parts: { text: string }[] }[] = [];
  const systemMessages: string[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemMessages.push(msg.content);
    } else {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }
  }

  const systemInstruction = systemMessages.length > 0
    ? { parts: systemMessages.map(t => ({ text: t })) }
    : undefined;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
          },
        }),
        signal: controller.signal,
      },
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      const err = new Error(`Gemini API error: status ${res.status} - ${errText}`);
      (err as unknown as { status: number }).status = res.status;
      throw err;
    }

    const data = await res.json();

    const content = data.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text || '')
      .join('') || '';

    // Gemini ne retourne pas le comptage de tokens dans la réponse simple
    return {
      content,
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount || 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata?.totalTokenCount || 0,
      },
      provider: 'gemini',
      model,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function* streamGemini(
  messages: AIMessage[],
  model: string,
  timeoutMs: number,
): AsyncGenerator<AIStreamChunk> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const contents: { role: string; parts: { text: string }[] }[] = [];
  const systemMessages: string[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemMessages.push(msg.content);
    } else {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: systemMessages.length > 0
            ? { parts: systemMessages.map(t => ({ text: t })) }
            : undefined,
          generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
        }),
        signal: controller.signal,
      },
    );

    if (!res.ok) {
      const err = new Error(`Gemini streaming error: status ${res.status}`);
      (err as unknown as { status: number }).status = res.status;
      throw err;
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (!controller.signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') { yield { delta: '', done: true }; return; }
        try {
          const parsed = JSON.parse(data);
          const text = parsed.candidates?.[0]?.content?.parts
            ?.map((p: { text?: string }) => p.text || '')
            .join('') || '';
          const isDone = !!parsed.candidates?.[0]?.finishReason;
          yield { delta: text, done: isDone };
          if (isDone) return;
        } catch { /* skip */ }
      }
    }
  } finally {
    clearTimeout(timer);
    if (!controller.signal.aborted) controller.abort();
  }
}

// ===========================================================================
// Groq
// ===========================================================================

async function callGroqDirect(
  messages: AIMessage[],
  model: string,
  timeoutMs: number,
): Promise<ProviderCallResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, messages, stream: false }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = new Error(`Groq API error: status ${res.status}`);
      (err as unknown as { status: number }).status = res.status;
      throw err;
    }

    const data = await res.json();
    return {
      content: data.choices?.[0]?.message?.content ?? '',
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      provider: 'groq',
      model,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function* streamGroqDirect(
  messages: AIMessage[],
  model: string,
  timeoutMs: number,
): AsyncGenerator<AIStreamChunk> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, messages, stream: true }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = new Error(`Groq streaming error: status ${res.status}`);
      (err as unknown as { status: number }).status = res.status;
      throw err;
    }

    yield* parseSseStream(res, controller);
  } finally {
    clearTimeout(timer);
    if (!controller.signal.aborted) controller.abort();
  }
}

// ===========================================================================
// OpenRouter
// ===========================================================================

async function callOpenRouterDirect(
  messages: AIMessage[],
  model: string,
  timeoutMs: number,
): Promise<ProviderCallResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      },
      body: JSON.stringify({ model, messages, stream: false }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = new Error(`OpenRouter API error: status ${res.status}`);
      (err as unknown as { status: number }).status = res.status;
      throw err;
    }

    const data = await res.json();
    return {
      content: data.choices?.[0]?.message?.content ?? '',
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      provider: 'openrouter',
      model,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function* streamOpenRouterDirect(
  messages: AIMessage[],
  model: string,
  timeoutMs: number,
): AsyncGenerator<AIStreamChunk> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      },
      body: JSON.stringify({ model, messages, stream: true }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = new Error(`OpenRouter streaming error: status ${res.status}`);
      (err as unknown as { status: number }).status = res.status;
      throw err;
    }

    yield* parseSseStream(res, controller);
  } finally {
    clearTimeout(timer);
    if (!controller.signal.aborted) controller.abort();
  }
}

// ===========================================================================
// SSE Stream Parser
// ===========================================================================

async function* parseSseStream(
  res: Response,
  controller: AbortController,
): AsyncGenerator<AIStreamChunk> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (!controller.signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') { yield { delta: '', done: true }; return; }
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content ?? '';
          const isDone = parsed.choices?.[0]?.finish_reason != null;
          const usage = parsed.usage
            ? {
                promptTokens: parsed.usage.prompt_tokens ?? 0,
                completionTokens: parsed.usage.completion_tokens ?? 0,
                totalTokens: parsed.usage.total_tokens ?? 0,
              }
            : undefined;
          yield { delta, done: isDone, usage };
          if (isDone) return;
        } catch { /* skip malformed */ }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ===========================================================================
// AIRouter class
// ===========================================================================

export class AIRouter {
  private readonly config: AIRouterConfig;

  constructor(config: Partial<AIRouterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config, providers: config.providers ?? DEFAULT_CONFIG.providers };
  }

  private getOrderedProviders(): ProviderConfig[] {
    return [...this.config.providers].sort((a, b) => a.priority - b.priority);
  }

  private resolveModel(provider: ProviderConfig, tier: ModelTier = 'default'): string {
    return provider.models[tier];
  }

  async generate(messages: AIMessage[], options: GenerateOptions = {}): Promise<AIResponse> {
    const { tier = 'default', systemPrompt } = options;
    const fullMessages: AIMessage[] = systemPrompt
      ? [{ role: 'system', content: systemPrompt }, ...messages]
      : messages;

    const requestId = generateRequestId();
    const providers = this.getOrderedProviders();
    let lastError: unknown;

    for (const provider of providers) {
      const model = this.resolveModel(provider, tier);

      // Skip Groq si on a détecté qu'il est probablement rate-limité
      if (provider.name === 'groq' && shouldSkipGroq()) {
        log.info('Skipping Groq (rate limit likely reached), trying next provider', { requestId });
        continue;
      }

      for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
        if (attempt > 0) {
          const backoff = Math.min(this.config.retryDelayMs * Math.pow(2, attempt - 1), 30_000);
          const jitter = Math.random() * 200;
          await sleep(backoff + jitter);
          log.warn('Retrying AI request', { requestId, provider: provider.name, attempt });
        }

        try {
          let result: ProviderCallResult;

          if (provider.name === 'groq' && process.env.GROQ_API_KEY) {
            result = await callGroqDirect(fullMessages, model, this.config.timeoutMs);
          } else if (provider.name === 'gemini' && (process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY)) {
            result = await callGemini(fullMessages, model, this.config.timeoutMs);
          } else if (provider.name === 'openrouter' && process.env.OPENROUTER_API_KEY) {
            result = await callOpenRouterDirect(fullMessages, model, this.config.timeoutMs);
          } else {
            result = await callZAI(fullMessages, model, provider.name, this.config.timeoutMs);
          }

          const costUsd = estimateCost(result.provider, model, result.usage.promptTokens, result.usage.completionTokens);

          log.info('AI request completed', {
            requestId, provider: result.provider, model,
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            costUsd,
          });

          return { ...result, costUsd };
        } catch (err) {
          lastError = err;
          if (!isTransientError(err)) {
            log.warn('Non-transient error, trying next provider', {
              requestId, provider: provider.name,
              error: err instanceof Error ? err.message : String(err),
            });
            break;
          }
          log.warn('Transient error, will retry', {
            requestId, provider: provider.name, attempt,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    log.error('All AI providers exhausted', { requestId, error: lastError });
    throw lastError ?? new Error('All AI providers exhausted');
  }

  async *stream(messages: AIMessage[], options: GenerateOptions = {}): AsyncGenerator<AIStreamChunk> {
    const { tier = 'default', systemPrompt } = options;
    const fullMessages: AIMessage[] = systemPrompt
      ? [{ role: 'system', content: systemPrompt }, ...messages]
      : messages;

    const requestId = generateRequestId();
    const providers = this.getOrderedProviders();
    let lastError: unknown;

    for (const provider of providers) {
      const model = this.resolveModel(provider, tier);

      if (provider.name === 'groq' && shouldSkipGroq()) {
        log.info('Skipping Groq streaming (rate limit likely reached), trying Gemini', { requestId });
        continue;
      }

      try {
        let generator: AsyncGenerator<AIStreamChunk>;

        if (provider.name === 'groq' && process.env.GROQ_API_KEY) {
          generator = streamGroqDirect(fullMessages, model, this.config.timeoutMs);
        } else if (provider.name === 'gemini' && (process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY)) {
          generator = streamGemini(fullMessages, model, this.config.timeoutMs);
        } else if (provider.name === 'openrouter' && process.env.OPENROUTER_API_KEY) {
          generator = streamOpenRouterDirect(fullMessages, model, this.config.timeoutMs);
        } else {
          generator = streamZAI(fullMessages, model, provider.name, this.config.timeoutMs);
        }

        log.info('AI stream started', { requestId, provider: provider.name, model });
        yield* generator;
        return;
      } catch (err) {
        lastError = err;
        log.warn('AI stream provider failed, trying next', {
          requestId, provider: provider.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    log.error('All AI providers exhausted for streaming', { requestId, error: lastError });
    throw lastError ?? new Error('All AI providers exhausted');
  }
}

async function callZAI(
  messages: AIMessage[],
  model: string,
  provider: string,
  timeoutMs: number,
): Promise<ProviderCallResult> {
  const zai = await ZAI.create();
  const controller = new AbortController();

  try {
    const completion = await Promise.race([
      zai.chat.completions.create({ messages, model, stream: false }),
      abortRace(controller, timeoutMs),
    ]);

    const content = completion.choices?.[0]?.message?.content ?? '';
    const usage = completion.usage ?? {};

    return {
      content,
      usage: {
        promptTokens: usage.prompt_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
        totalTokens: usage.total_tokens ?? 0,
      },
      provider,
      model,
    };
  } finally {
    if (!controller.signal.aborted) controller.abort();
  }
}

async function* streamZAI(
  messages: AIMessage[],
  model: string,
  provider: string,
  timeoutMs: number,
): AsyncGenerator<AIStreamChunk> {
  const zai = await ZAI.create();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const stream = await zai.chat.completions.create({ messages, model, stream: true });

    for await (const chunk of stream) {
      if (controller.signal.aborted) break;
      const delta = chunk.choices?.[0]?.delta?.content ?? '';
      const isDone = chunk.choices?.[0]?.finish_reason != null;
      yield { delta, done: isDone, usage: chunk.usage ? {
        promptTokens: chunk.usage.prompt_tokens ?? 0,
        completionTokens: chunk.usage.completion_tokens ?? 0,
        totalTokens: chunk.usage.total_tokens ?? 0,
      } : undefined };
      if (isDone) break;
    }
  } finally {
    clearTimeout(timer);
    if (!controller.signal.aborted) controller.abort();
  }
}

// ===========================================================================
// Module-level singleton
// ===========================================================================

let _defaultRouter: AIRouter | null = null;

export function getAIRouter(config?: Partial<AIRouterConfig>): AIRouter {
  if (!_defaultRouter || config) _defaultRouter = new AIRouter(config);
  return _defaultRouter;
}

export async function generateText(messages: AIMessage[], options: GenerateOptions = {}): Promise<AIResponse> {
  return getAIRouter().generate(messages, options);
}

export function streamText(messages: AIMessage[], options: GenerateOptions = {}): AsyncGenerator<AIStreamChunk> {
  return getAIRouter().stream(messages, options);
}
