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
    defaultModel: 'mixtral-8x7b-32768',
    models: {
      'mixtral-8x7b-32768': { input: 0.27, output: 0.27 },
      'llama-3.1-70b-versatile': { input: 0.59, output: 0.79 },
      'llama-3.1-8b-instant': { input: 0.07, output: 0.07 },
    },
    weight: 60,
    timeout: 30000,
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
