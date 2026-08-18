// ============================================================
// Gen3ia — LLM Provider Abstraction Layer
// Support multi-provider avec fallback automatique
// Providers: OpenAI, Anthropic, Groq, OpenRouter, HuggingFace
// ============================================================

export type LLMProvider = 'openai' | 'anthropic' | 'groq' | 'openrouter' | 'huggingface';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  messages: LLMMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  userId?: string;
  sessionId?: string;
}

export interface LLMResponse {
  content: string;
  tokens: number;
  provider: LLMProvider;
  model: string;
  latencyMs: number;
  cached: boolean;
}

export interface ProviderConfig {
  name: LLMProvider;
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  models: Record<string, { input: number; output: number }>;
  weight: number; // poids pour le routage (plus haut = prioritaire)
  timeout: number;
}

const PROVIDER_CONFIGS: Record<LLMProvider, ProviderConfig> = {
  openai: {
    name: 'openai',
    apiKey: process.env.OPENAI_API_KEY || '',
    baseUrl: (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    defaultModel: process.env.LLM_MODEL || 'gpt-4o-mini',
    models: {
      'gpt-4o': { input: 2.50, output: 10.00 },
      'gpt-4o-mini': { input: 0.15, output: 0.60 },
      'gpt-4-turbo': { input: 10.00, output: 30.00 },
    },
    weight: 100,
    timeout: 30000,
  },
  anthropic: {
    name: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-haiku-20240307',
    models: {
      'claude-3-opus-20240229': { input: 15.00, output: 75.00 },
      'claude-3-sonnet-20240229': { input: 3.00, output: 15.00 },
      'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
    },
    weight: 80,
    timeout: 30000,
  },
  groq: {
    name: 'groq',
    apiKey: process.env.GROQ_API_KEY || '',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    models: {
      'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
      'llama-3.1-70b-versatile': { input: 0.59, output: 0.79 },
      'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
      'llama-3.2-1b-preview': { input: 0.04, output: 0.04 },
      'llama-3.2-3b-preview': { input: 0.06, output: 0.06 },
      'llama-3.2-11b-vision-preview': { input: 0.59, output: 0.79 },
      'llama-3.2-90b-vision-preview': { input: 0.59, output: 0.79 },
      'mixtral-8x7b-32768': { input: 0.24, output: 0.24 },
      'gemma2-9b-it': { input: 0.20, output: 0.20 },
      'deepseek-r1-distill-llama-70b': { input: 0.75, output: 0.99 },
      'qwen-2.5-coder-32b': { input: 0.29, output: 0.39 },
      'qwen-2.5-72b-instruct': { input: 0.79, output: 0.79 },
    },
    // Boosté : Groq est notre provider PREFFÉRÉ pour la réflexion agent.
    // Latence ~150 tokens/s, throughput très élevé, gratuit pour beaucoup de modèles.
    weight: 200,
    timeout: 30_000,
  },
  openrouter: {
    name: 'openrouter',
    apiKey: process.env.OPENROUTER_API_KEY || '',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    models: {},
    weight: 40,
    timeout: 60000,
  },
  huggingface: {
    name: 'huggingface',
    apiKey: process.env.HUGGINGFACE_API_KEY || '',
    baseUrl: 'https://api-inference.huggingface.co/models',
    defaultModel: 'HuggingFaceH4/zephyr-7b-beta',
    models: {},
    weight: 20,
    timeout: 60000,
  },
};

export function getActiveProviders(): ProviderConfig[] {
  return Object.values(PROVIDER_CONFIGS)
    .filter(p => p.apiKey)
    .sort((a, b) => b.weight - a.weight);
}

export function isProviderAvailable(name: LLMProvider): boolean {
  return !!PROVIDER_CONFIGS[name]?.apiKey;
}

export function getProviderConfig(name: LLMProvider): ProviderConfig | null {
  return PROVIDER_CONFIGS[name] ?? null;
}

export const PROVIDER_NAMES: LLMProvider[] = ['openai', 'anthropic', 'groq', 'openrouter', 'huggingface'];
