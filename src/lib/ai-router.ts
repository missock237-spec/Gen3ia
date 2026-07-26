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
    {
      name: 'openai', priority: 3,
      models: { default: 'gpt-4o', fast: 'gpt-4o-mini', powerful: 'o3-mini' },
    },
    {
      name: 'anthropic', priority: 4,
      models: { default: 'claude-3.5-sonnet', fast: 'claude-3-haiku', powerful: 'claude-4-sonnet' },
    },
  ],
  maxRetries: 3,
  retryDelayMs: 500,
  timeoutMs: 60_000,
};

const PRICING: Record<string, { input: number; output: number }> = {
  'groq/llama-3.3-70b-versatile': { input: 0.00059, output: 0.00079 },
  'groq/llama-3.1-8b-instant': { input: 0.00005, output: 0.00008 },
  'openrouter/meta-llama/llama-3.1-8b-instruct:free': { input: 0, output: 0 },
  'openrouter/meta-llama/llama-3.1-70b-instruct': { input: 0.00065, output: 0.00075 },
  'openai/gpt-4o': { input: 0.0025, output: 0.010 },
  'openai/gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'openai/o3-mini': { input: 0.0011, output: 0.0044 },
  'anthropic/claude-3.5-sonnet': { input: 0.003, output: 0.015 },
  'anthropic/claude-3-haiku': { input: 0.00025, output: 0.00125 },
  'anthropic/claude-4-sonnet': { input: 0.015, output: 0.075 },
};

function getCostPerK(provider: string, model: string): { prompt: number; completion: number } {
  const key = `${provider}/${model}`;
  const p = PRICING[key];
  if (p) return { prompt: p.input, completion: p.output };
  return { prompt: 0.001, completion: 0.002 };
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
        msg.includes('econnrefused') || msg.includes('rate limit') || msg.includes('overloaded'))
      return true;
    if (msg.includes('forbidden') || msg.includes('unauthorized') || msg.includes('invalid api') ||
        msg.includes('authentication'))
      return false;
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

async function callOpenAI(messages: AIMessage[], model: string, timeoutMs: number): Promise<ProviderCallResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false }),
      signal: controller.signal,
    });
    if (!res.ok) { const e = new Error(`OpenAI API error: status ${res.status}`); (e as any).status = res.status; throw e; }
    const data = await res.json();
    return {
      content: data.choices?.[0]?.message?.content ?? '',
      usage: { promptTokens: data.usage?.prompt_tokens ?? 0, completionTokens: data.usage?.completion_tokens ?? 0, totalTokens: data.usage?.total_tokens ?? 0 },
      provider: 'openai', model,
    };
  } finally { clearTimeout(timer); }
}

async function callAnthropic(messages: AIMessage[], model: string, timeoutMs: number): Promise<ProviderCallResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const systemMsg = messages.find(m => m.role === 'system')?.content || '';
    const userMsgs = messages.filter(m => m.role !== 'system');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 4096, system: systemMsg, messages: userMsgs }),
      signal: controller.signal,
    });
    if (!res.ok) { const e = new Error(`Anthropic API error: status ${res.status}`); (e as any).status = res.status; throw e; }
    const data = await res.json();
    const text = data.content?.find((c: any) => c.type === 'text')?.text || '';
    return {
      content: text,
      usage: { promptTokens: data.usage?.input_tokens ?? 0, completionTokens: data.usage?.output_tokens ?? 0, totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0) },
      provider: 'anthropic', model,
    };
  } finally { clearTimeout(timer); }
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
    return {
      content: data.choices?.[0]?.message?.content ?? '',
      usage: { promptTokens: data.usage?.prompt_tokens ?? 0, completionTokens: data.usage?.completion_tokens ?? 0, totalTokens: data.usage?.total_tokens ?? 0 },
      provider: 'groq', model,
    };
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
    return {
      content: data.choices?.[0]?.message?.content ?? '',
      usage: { promptTokens: data.usage?.prompt_tokens ?? 0, completionTokens: data.usage?.completion_tokens ?? 0, totalTokens: data.usage?.total_tokens ?? 0 },
      provider: 'openrouter', model,
    };
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
          log.warn(`Provider ${provider.name}/${model} failed`, { transient, error: error instanceof Error ? error.message : String(error), attempt: attempt + 1 });
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
        if (process.env.GROQ_API_KEY) return callGroqDirect(messages, model, this.config.timeoutMs);
        break;
      case 'openrouter':
        if (process.env.OPENROUTER_API_KEY) return callOpenRouterDirect(messages, model, this.config.timeoutMs);
        break;
      case 'openai':
        if (process.env.OPENAI_API_KEY) return callOpenAI(messages, model, this.config.timeoutMs);
        break;
      case 'anthropic':
        if (process.env.ANTHROPIC_API_KEY) return callAnthropic(messages, model, this.config.timeoutMs);
        break;
    }
    // Fallback universel : OpenAI si disponible
    if (process.env.OPENAI_API_KEY) return callOpenAI(messages, 'gpt-4o-mini', this.config.timeoutMs);
    throw new Error('No AI provider configured. Set at least OPENAI_API_KEY.');
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

export async function chatCompletion(messages: AIMessage[], mode: 'default' | 'fast' | 'powerful' | 'quick_chat' | 'analysis' | 'reasoning' | 'orchestration' = 'default'): Promise<AIResponse> {
  const modelTier = (mode === 'fast' || mode === 'quick_chat') ? 'fast' as const
    : (mode === 'powerful' || mode === 'analysis' || mode === 'reasoning' || mode === 'orchestration') ? 'powerful' as const
    : 'default' as const;
  const router = createAIRouter('system');
  return router.chat(messages, { model: modelTier });
}
