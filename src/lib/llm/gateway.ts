// ============================================================
// Gen3ia — LLM Gateway
// Point d'entrée unique pour tous les appels LLM.
// Cache → Provider principal → Fallback → Retry
// ============================================================

import { LLMMessage, LLMRequest, LLMResponse, LLMProvider, getActiveProviders, isProviderAvailable } from './provider';
import { llmCache } from './cache';
import { createLogger } from '@/lib/logger';

const log = createLogger('llm-gateway');

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 2048;

interface GatewayCallOptions {
  /** Désactiver le cache pour cet appel */
  noCache?: boolean;
  /** Providers à utiliser (ordre de priorité) */
  providers?: LLMProvider[];
  /** Timeout en ms */
  timeout?: number;
  /** Tag pour les métriques */
  tag?: string;
}

/**
 * Appelle un provider LLM avec fetch
 */
async function callProvider(
  provider: { name: LLMProvider; baseUrl: string; apiKey: string; defaultModel: string; timeout: number },
  request: LLMRequest,
  model?: string
): Promise<LLMResponse> {
  const start = Date.now();
  const selectedModel = model || provider.defaultModel;
  const url = `${provider.baseUrl}/chat/completions`;

  const body = {
    model: selectedModel,
    messages: request.messages,
    max_tokens: request.maxTokens || DEFAULT_MAX_TOKENS,
    temperature: request.temperature ?? DEFAULT_TEMPERATURE,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: request.signal || AbortSignal.timeout(request.timeout || provider.timeout),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => 'unknown');
    throw new Error(`[${provider.name}] HTTP ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = await response.json();
  const latencyMs = Date.now() - start;

  return {
    content: data.choices?.[0]?.message?.content || '',
    tokens: data.usage?.totalTokens || 0,
    provider: provider.name,
    model: data.model || selectedModel,
    latencyMs,
    cached: false,
  };
}

/**
 * Point d'entrée unique pour tous les appels LLM.
 *
 * 1. Vérifie le cache (si activé)
 * 2. Appelle le provider principal
 * 3. En cas d'échec, fallback sur le provider suivant
 * 4. Sauvegarde dans le cache
 */
export async function callLLM(request: LLMRequest, options: GatewayCallOptions = {}): Promise<LLMResponse> {
  // 1. Vérifier le cache
  if (!options.noCache) {
    const cacheKey = LLMCache.generateKey(request.messages, request.model || '');
    const cached = await llmCache.get(cacheKey);
    if (cached) {
      log.info('llm_cache_hit', { tag: options.tag });
      return {
        content: cached.content,
        tokens: cached.tokens,
        provider: 'openai',
        model: request.model || 'cached',
        latencyMs: 0,
        cached: true,
      };
    }
  }

  // 2. Déterminer les providers à utiliser
  const activeProviders = options.providers
    ? options.providers.filter(p => isProviderAvailable(p)).map(p => ({
        name: p,
        baseUrl: p === 'openai' ? (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '') : `https://api.${p}.com/v1`,
        apiKey: process.env[`${p.toUpperCase()}_API_KEY`] || '',
        defaultModel: request.model || (p === 'openai' ? process.env.LLM_MODEL || 'gpt-4o-mini' : ''),
        timeout: options.timeout || 30000,
      }))
    : getActiveProviders();

  if (activeProviders.length === 0) {
    // Fallback: réponse simulée pour le développement
    log.warn('llm_no_provider', { tag: options.tag });
    const lastMsg = request.messages[request.messages.length - 1]?.content || '';
    return {
      content: `[Mode démo] Réponse simulée pour : "${lastMsg.slice(0, 100)}"`,
      tokens: 50,
      provider: 'huggingface',
      model: 'demo-mode',
      latencyMs: 0,
      cached: false,
    };
  }

  // 3. Tenter chaque provider avec retry
  let lastError: Error | null = null;

  for (const provider of activeProviders) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await callProvider(provider, request);

        // 4. Sauvegarder dans le cache
        if (!options.noCache) {
          const cacheKey = LLMCache.generateKey(request.messages, result.model);
          await llmCache.set(cacheKey, {
            content: result.content,
            tokens: result.tokens,
            cachedAt: Date.now(),
            ttl: CACHE_TTL_MS,
          });
        }

        log.info('llm_success', {
          provider: provider.name,
          model: result.model,
          latencyMs: result.latencyMs,
          tokens: result.tokens,
          attempt,
          tag: options.tag,
        });

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        log.warn('llm_attempt_failed', {
          provider: provider.name,
          attempt,
          error: lastError.message,
          tag: options.tag,
        });

        // Attendre avant retry
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
        }
      }
    }
  }

  // 5. Tous les providers ont échoué
  log.error('llm_all_providers_failed', {
    lastError: lastError?.message,
    tag: options.tag,
  });

  throw new Error(`Tous les providers LLM ont échoué. Dernière erreur: ${lastError?.message}`);
}

/**
 * Retourne les stats du cache LLM
 */
export function getLLMCacheStats() {
  return llmCache.getStats();
}
