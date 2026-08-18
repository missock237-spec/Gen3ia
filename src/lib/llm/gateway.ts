// ============================================================
// Gen3ia — LLM Gateway
// Point d'entrée unique pour tous les appels LLM.
// Cache → Routeur Groq-preferred (circuit-breaker) → Provider principal → Fallback → Retry
// ============================================================

import {
  LLMMessage,
  LLMRequest,
  LLMResponse,
  LLMProvider,
  getActiveProviders,
  isProviderAvailable,
  getProviderConfig,
  ProviderConfig,
} from './provider';
import { llmCache } from './cache';
import { groqRouter } from './groq-router';
import { createLogger } from '@/lib/logger';
import type { RouterSnapshot } from './groq-router';

const log = createLogger('llm-gateway');

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_RETRIES = 1; // 1 retry intra-provider ; le routeur gère le fallback inter-provider
const RETRY_DELAY_MS = 800;
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 2048;

interface GatewayCallOptions {
  /** Désactiver le cache pour cet appel */
  noCache?: boolean;
  /** Providers à utiliser (ordre de priorité) — surcharge temporaire du routeur */
  providers?: LLMProvider[];
  /** Timeout en ms (par provider) */
  timeout?: number;
  /** Tag pour les métriques */
  tag?: string;
  /** Si true, force l'utilisation du routeur Groq-preferred même si options.providers est défini */
  preferGroqRouting?: boolean;
}

// ============================================================
//  Appel direct à un provider donné (OpenAI-compatible /chat/completions)
// ============================================================

async function callProvider(
  cfg: ProviderConfig,
  request: LLMRequest,
  modelOverride?: string,
  timeoutOverride?: number,
): Promise<LLMResponse> {
  const start = Date.now();
  const selectedModel = modelOverride || cfg.defaultModel;
  const url = `${cfg.baseUrl}/chat/completions`;

  const body: Record<string, unknown> = {
    model: selectedModel,
    messages: request.messages,
    max_tokens: request.maxTokens || DEFAULT_MAX_TOKENS,
    temperature: request.temperature ?? DEFAULT_TEMPERATURE,
  };

  // Anthropic a une API différente, mais on conserve le format OpenAI-compatible
  // car leur endpoint /v1/messages n'est pas utilisé ici. Si ANTHROPIC_API_KEY
  // est défini, on suppose qu'un proxy OpenAI-compatible est utilisé (via LLM_BASE_URL).
  // Pour usage natif Anthropic, on utilisera une classe dédiée plus tard.

  const controller = new AbortController();
  const timeoutMs = timeoutOverride || cfg.timeout || 30_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: request.signal || controller.signal,
    });

    if (!response.ok) {
      const err = await response.text().catch(() => 'unknown');
      throw new Error(`[${cfg.name}] HTTP ${response.status}: ${err.slice(0, 200)}`);
    }

    const data = await response.json();
    const latencyMs = Date.now() - start;

    return {
      content: data.choices?.[0]?.message?.content || '',
      tokens: data.usage?.total_tokens || data.usage?.totalTokens || 0,
      provider: cfg.name,
      model: data.model || selectedModel,
      latencyMs,
      cached: false,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================
//  Point d'entrée unique : callLLM
// ============================================================

/**
 * Appelle un LLM via le routeur Groq-preferred avec fallback automatique.
 *
 * 1. Vérifie le cache (si noCache=false)
 * 2. Demande au routeur une décision (liste ordonnée de providers éligibles)
 * 3. Pour chaque provider éligible, tente l'appel avec retry intra-provider
 * 4. En cas d'échec (HTTP 429/503/529 ou N erreurs consécutives), le routeur
 *    ouvre le circuit du provider et on bascule sur le suivant
 * 5. Sauvegarde dans le cache en cas de succès
 */
export async function callLLM(
  request: LLMRequest,
  options: GatewayCallOptions = {},
): Promise<LLMResponse> {
  // 1. Cache lookup
  if (!options.noCache) {
    const cacheKey = llmCacheKey(request.messages, request.model || '');
    const cached = await llmCache.get(cacheKey);
    if (cached) {
      log.info('llm_cache_hit', { tag: options.tag });
      return {
        content: cached.content,
        tokens: cached.tokens,
        provider: 'groq', // marqué comme cache hit (provider nominal)
        model: request.model || 'cached',
        latencyMs: 0,
        cached: true,
      };
    }
  }

  // 2. Déléguer au routeur Groq-preferred
  const tag = options.tag;
  const preferGroq = options.preferGroqRouting !== false; // défaut true

  let result: LLMResponse;

  if (preferGroq && !options.providers) {
    // Route par défaut : Groq → OpenAI → Anthropic → OpenRouter → HuggingFace
    result = await groqRouter.execute(request, callProviderForRouter, { tag });
  } else if (options.providers && options.providers.length > 0) {
    // Override explicite : utiliser ces providers dans cet ordre, mais
    // en passant par le routeur pour bénéficier du circuit-breaker.
    result = await groqRouter.execute(request, callProviderForRouter, { tag, providers: options.providers });
  } else {
    // Pas de préférence Groq explicite — utiliser le routeur quand même
    // (comportement par défaut : preferGroq=true).
    result = await groqRouter.execute(request, callProviderForRouter, { tag });
  }

  // 3. Cache store
  if (!options.noCache) {
    const cacheKey = llmCacheKey(request.messages, result.model);
    try {
      await llmCache.set(cacheKey, {
        content: result.content,
        tokens: result.tokens,
        cachedAt: Date.now(),
        ttl: CACHE_TTL_MS,
      });
    } catch (e) {
      log.warn('llm_cache_set_failed', { error: e instanceof Error ? e.message : '' });
    }
  }

  // 4. Log final
  const snapshot = (result as LLMResponse & { _routerSnapshot?: RouterSnapshot })._routerSnapshot;
  log.info('llm_success', {
    provider: result.provider,
    model: result.model,
    latencyMs: result.latencyMs,
    tokens: result.tokens,
    cached: result.cached,
    tag,
    primary: snapshot?.primary,
    fallbacks: snapshot?.fallbacks,
  });

  return result;
}

/**
 * Adaptateur : appelle callProvider avec le cfg fourni par le routeur.
 * Inclut le retry intra-provider (1 essai supplémentaire en cas d'erreur réseau).
 */
async function callProviderForRouter(
  providerName: LLMProvider,
  cfg: ProviderConfig,
  request: LLMRequest,
  modelOverride?: string,
): Promise<LLMResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await callProvider(cfg, request, modelOverride);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      log.warn('llm_attempt_failed', {
        provider: providerName,
        attempt,
        error: lastError.message.slice(0, 200),
      });
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
      }
    }
  }
  throw lastError ?? new Error('unknown LLM error');
}

// ============================================================
//  Helpers
// ============================================================

/**
 * Retourne les stats du cache LLM
 */
export function getLLMCacheStats() {
  return llmCache.getStats();
}

/**
 * Retourne un snapshot du routeur (observabilité).
 */
export function getRouterSnapshot(): RouterSnapshot {
  return groqRouter.getSnapshot();
}

/**
 * Force la réinitialisation d'un provider (admin / dev).
 */
export function resetProvider(name: LLMProvider): void {
  groqRouter.resetProvider(name);
}

export function resetAllProviders(): void {
  groqRouter.resetAll();
}

// ============================================================
//  Compatibilité legacy : getActiveProviders, isProviderAvailable
// ============================================================
export { getActiveProviders, isProviderAvailable };

// ============================================================
//  Cache key helper (DJB2 hash des messages + modèle)
// ============================================================
function llmCacheKey(messages: LLMMessage[], model: string): string {
  const payload = JSON.stringify({ messages, model });
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const c = payload.charCodeAt(i);
    hash = ((hash << 5) - hash) + c;
    hash = hash & hash;
  }
  return `llm:${model}:${hash}`;
}
