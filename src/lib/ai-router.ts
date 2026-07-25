import ZAI from 'z-ai-web-dev-sdk';
import { createLogger } from '@/lib/logger';

const log = createLogger('ai-router');

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

const DEFAULT_CONFIG: AIRouterConfig = {
  providers: [
    {
      name: 'groq', priority: 1,
      models: { default: 'llama-3.3-70b-versatile', fast: 'llama-3.1-8b-instant', powerful: 'llama-3.3-70b-versatile' },
    },
    {
      name: 'openrouter', priority: 2,
      models: { default: 'meta-llama/llama-3.1-8b-instruct:free', fast: 'meta-llama/llama-3.1-8b-instruct:free', powerful: 'meta-llama/llama-3.1-70b-instruct' },
    },
  ],
  maxRetries: 3,
  retryDelayMs: 500,
  timeoutMs: 60_000,
};

const GROQ_COST_PER_K: Record<string, { prompt: number; completion: number }> = {
  default:  { prompt: 0.00059, completion: 0.00079 },
  fast:     { prompt: 0.00005, completion: 0.00008 },
  powerful: { prompt: 0.00059, completion: 0.00079 },
};

const OPENROUTER_COST_PER_K: Record<string, { prompt: number; completion: number }> = {
  'meta-llama/llama-3.1-8b-instruct:free': { prompt: 0, completion: 0 },
  'meta-llama/llama-3.1-70b-instruct':      { prompt: 0.00065, completion: 0.00075 },
};

function getCostPerK(provider: string, model: string): { prompt: number; completion: number } {
  if (provider === 'groq') return GROQ_COST_PER_K[model] ?? { prompt: 0, completion: 0 };
  if (provider === 'openrouter') return OPENROUTER_COST_PER_K[model] ?? { prompt: 0.0005, completion: 0.0006 };
  return { prompt: 0, completion: 0 };
}

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
    if (msg.includes('network') || msg.includes('timeout') || msg.includes('econnreset') ||
        msg.includes('econnrefused') || msg.includes('rate limit') || msg.includes('overloaded')) {
      return true;
    }
    if (msg.includes('forbidden') || msg.includes('unauthorized') || msg.includes('invalid api') ||
        msg.includes('authentication')) {
      return false;
    }
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function generateRequestId(): string {
  return `ai_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

interface ProviderCallResult {
  content: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  provider: string;
  model: string;
}

async function callZAI(messages: AIMessage[], model: string, provider: string, timeoutMs: number): Promise<ProviderCallResult> {
  const zai = await ZAI.create();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const completion = await zai.chat.completions.create({ messages, model, stream: false });
    const content = completion.choices?.[0]?.message?.content ?? '';
    const usage = completion.usage ?? {};
    return { content, usage: { promptTokens: usage.prompt_tokens ?? 0, completionTokens: usage.completion_tokens ?? 0, totalTokens: usage.total_tokens ?? 0 }, provider, model };
  } finally {
    clearTimeout(timer);
  }
}

async function callGroqDirect(messages: AIMessage[], model: string, timeoutMs: number): Promise<ProviderCallResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false }),
      signal: controller.signal,
    });
    if (!res.ok) { const e = new Error(`Groq API error: status ${res.status}`); (e as any).status = res.status; throw e; }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    return { content, usage: { promptTokens: data.usage?.prompt_tokens ?? 0, completionTokens: data.usage?.completion_tokens ?? 0, totalTokens: data.usage?.total_tokens ?? 0 }, provider: 'groq', model };
  } finally { clearTimeout(timer); }
}

async function callOpenRouterDirect(messages: AIMessage[], model: string, timeoutMs: number): Promise<ProviderCallResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000' },
      body: JSON.stringify({ model, messages, stream: false }),
      signal: controller.signal,
    });
    if (!res.ok) { const e = new Error(`OpenRouter API error: status ${res.status}`); (e as any).status = res.status; throw e; }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    return { content, usage: { promptTokens: data.usage?.prompt_tokens ?? 0, completionTokens: data.usage?.completion_tokens ?? 0, totalTokens: data.usage?.total_tokens ?? 0 }, provider: 'openrouter', model };
  } finally { clearTimeout(timer); }
}

export class AIRouter {
  private config: AIRouterConfig;
  private userId: string;

  constructor(userId: string, config?: Partial<AIRouterConfig>) {
    this.userId = userId;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async chat(messages: AIMessage[], options?: { model?: 'default' | 'fast' | 'powerful'; provider?: string }): Promise<AIResponse> {
    const modelTier = options?.model ?? 'default';
    const requestedProvider = options?.provider;
    let providers = [...this.config.providers].sort((a, b) => a.priority - b.priority);
    if (requestedProvider) {
      const match = providers.find((p) => p.name === requestedProvider);
      if (match) providers = [match, ...providers.filter((p) => p.name !== requestedProvider)];
    }
    let lastError: unknown;
    for (const provider of providers) {
      const model = provider.models[modelTier];
      for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
        try {
          const result = await this.callProvider(messages, model, provider.name);
          const costUsd = this.estimateCost(provider.name, model, result.usage.promptTokens, result.usage.completionTokens);
          await this.trackUsage(provider.name, model, result.usage.promptTokens, result.usage.completionTokens, costUsd);
          return { content: result.content, usage: result.usage, provider: result.provider, model: result.model, costUsd };
        } catch (error) {
          lastError = error;
          const transient = isTransientError(error);
          log.warn(`Provider ${provider.name}/${model} failed (attempt ${attempt + 1}/${this.config.maxRetries + 1})`, { transient, error: error instanceof Error ? error.message : String(error) });
          if (!transient) break;
          if (attempt < this.config.maxRetries) await sleep(this.config.retryDelayMs * Math.pow(2, attempt));
        }
      }
    }
    throw lastError ?? new Error('All AI providers failed');
  }

  estimateCost(provider: string, model: string, promptTokens: number, completionTokens: number): number {
    const rates = getCostPerK(provider, model);
    return (promptTokens / 1000) * rates.prompt + (completionTokens / 1000) * rates.completion;
  }

  private async callProvider(messages: AIMessage[], model: string, providerName: string): Promise<ProviderCallResult> {
    switch (providerName) {
      case 'groq':
        if (process.env.GROQ_API_KEY) {
          try { return await callGroqDirect(messages, model, this.config.timeoutMs); }
          catch (error) {
            if (!isTransientError(error)) { log.info(`Groq direct failed, falling back to z-ai-sdk`); break; }
            throw error;
          }
        }
        break;
      case 'openrouter':
        if (process.env.OPENROUTER_API_KEY) {
          try { return await callOpenRouterDirect(messages, model, this.config.timeoutMs); }
          catch (error) {
            if (!isTransientError(error)) { log.info(`OpenRouter direct failed, falling back to z-ai-sdk`); break; }
            throw error;
          }
        }
        break;
    }
    return callZAI(messages, model, providerName, this.config.timeoutMs);
  }

  private async trackUsage(provider: string, model: string, promptTokens: number, completionTokens: number, costUsd: number): Promise<void> {
    const requestId = generateRequestId();
    try {
      const { trackAICost } = await import('@/lib/analytics');
      await trackAICost({ userId: this.userId, provider, model, promptTokens, completionTokens, costUsd, requestId });
    } catch {}
    log.info('AI request completed', { provider, model, promptTokens, completionTokens, costUsd: costUsd.toFixed(6), requestId });
  }
}

export function createAIRouter(userId: string, config?: Partial<AIRouterConfig>): AIRouter {
  return new AIRouter(userId, config);
}

export async function chatCompletion(messages: AIMessage[], mode: 'default' | 'fast' | 'powerful' | 'quick_chat' | 'analysis' | 'reasoning' | 'orchestration' = 'default'): Promise<{ content: string; usage: { promptTokens: number; completionTokens: number; totalTokens: number }; provider: string; model: string; costUsd: number }> {
  const modelTier = (mode === 'fast' || mode === 'quick_chat') ? 'fast' as const
    : (mode === 'powerful' || mode === 'analysis' || mode === 'reasoning' || mode === 'orchestration') ? 'powerful' as const
    : 'default' as const;
  const router = createAIRouter('system');
  return router.chat(messages, { model: modelTier });
}
