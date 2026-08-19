// ============================================================
// Gen3ia — LLM Groq-Preferred Router with Auto Failover
// ------------------------------------------------------------
// Stratégie de routage :
//   1. PREFFÉRÉ : Groq (latence faible, throughput élevé, gratuit pour
//      la plupart des modèles open-source Llama/Mixtral).
//   2. Lorsque Groq atteint sa limite (HTTP 429 / 503 / quota journalier),
//      on bascule AUTOMATIQUEMENT vers OpenAI puis Anthropic.
//   3. Circuit-breaker par provider : après N échecs consécutifs, le
//      provider est marqué OPEN (en cooldown) pendant `cooldownMs`.
//   4. Pendant le cooldown, on ignore Groq et on route sur le fallback.
//   5. Après le cooldown, on tente un "half-open" : 1 requête est
//      autorisée vers Groq. Si elle réussit → CLOSED (Groq reprend).
//      Si elle échoue → OPEN pour un nouveau cycle.
//   6. À tout moment on expose `getRouterSnapshot()` pour l'observabilité
//      (devops dashboard, métriques Prometheus).
// ============================================================

import { createLogger } from '@/lib/logger';
import type { LLMProvider, LLMRequest, LLMResponse, ProviderConfig } from './provider';
import { getProviderConfig, isProviderAvailable, PROVIDER_NAMES } from './provider';

const log = createLogger('groq-router');

// ─── Types ────────────────────────────────────────────────────────────────

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface RouterProviderStats {
  name: LLMProvider;
  state: CircuitState;
  /** Nombre d'échecs consécutifs (remis à 0 sur succès) */
  consecutiveFailures: number;
  /** Nombre total d'appels réussis */
  totalSuccess: number;
  /** Nombre total d'appels échoués */
  totalFailures: number;
  /** Timestamp du dernier échec (ms epoch) ou null */
  lastFailureAt: number | null;
  /** Timestamp où le circuit OUVERT passera en HALF_OPEN (ms epoch) ou null */
  cooldownEndsAt: number | null;
  /** Dernière raison d'échec (HTTP status, message) */
  lastError: string | null;
  /** Dernière latence observée (ms) */
  lastLatencyMs: number | null;
}

export interface RouterSnapshot {
  /** Provider actuellement préféré (le premier CLOSED dans l'ordre de priorité) */
  primary: LLMProvider;
  /** Liste ordonnée des providers de fallback actifs */
  fallbacks: LLMProvider[];
  /** Statistiques détaillées par provider */
  providers: RouterProviderStats[];
  /** Timestamp (ms epoch) */
  snapshotAt: number;
}

export interface RouterOptions {
  /** Ordre de priorité (par défaut : groq → openai → anthropic → openrouter → huggingface) */
  priorityOrder?: LLMProvider[];
  /** Nombre d'échecs consécutifs avant d'ouvrir le circuit */
  failureThreshold?: number;
  /** Durée de cooldown après ouverture du circuit (ms) */
  cooldownMs?: number;
  /** Timeout total par provider (ms) */
  perProviderTimeoutMs?: number;
  /** Nombre maximal de providers à tenter avant échec */
  maxProvidersToTry?: number;
}

export interface RouteDecision {
  /** Liste des providers à tenter dans l'ordre, après application du circuit-breaker */
  ordered: LLMProvider[];
  /** Snapshot pour logging/observabilité */
  snapshot: RouterSnapshot;
}

// ─── State immuable par défaut, mutable via méthode ────────────────────────

interface ProviderRuntimeState {
  consecutiveFailures: number;
  totalSuccess: number;
  totalFailures: number;
  lastFailureAt: number | null;
  cooldownEndsAt: number | null;
  state: CircuitState;
  lastError: string | null;
  lastLatencyMs: number | null;
  // Half-open : 1 essai en cours. Mis à true au passage OPEN→HALF_OPEN,
  // remis à false dès qu'on tente l'appel.
  halfOpenTrialUsed: boolean;
}

function makeInitialState(): Record<LLMProvider, ProviderRuntimeState> {
  const states: Partial<Record<LLMProvider, ProviderRuntimeState>> = {};
  for (const name of PROVIDER_NAMES) {
    states[name] = {
      consecutiveFailures: 0,
      totalSuccess: 0,
      totalFailures: 0,
      lastFailureAt: null,
      cooldownEndsAt: null,
      state: 'CLOSED',
      lastError: null,
      lastLatencyMs: null,
      halfOpenTrialUsed: false,
    };
  }
  return states as Record<LLMProvider, ProviderRuntimeState>;
}

// ─── Router ────────────────────────────────────────────────────────────────

class GroqPreferredRouter {
  private readonly states: Record<LLMProvider, ProviderRuntimeState>;
  private readonly priorityOrder: LLMProvider[];
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly perProviderTimeoutMs: number;
  private readonly maxProvidersToTry: number;

  constructor(options: RouterOptions = {}) {
    this.states = makeInitialState();
    this.priorityOrder = options.priorityOrder ?? ['groq', 'openai', 'anthropic', 'openrouter', 'huggingface'];
    this.failureThreshold = options.failureThreshold ?? 3;
    this.cooldownMs = options.cooldownMs ?? 60_000; // 1 minute
    this.perProviderTimeoutMs = options.perProviderTimeoutMs ?? 30_000;
    this.maxProvidersToTry = options.maxProvidersToTry ?? 3;
  }

  // --------------------------------------------------------------------
  // Décision de routage
  // --------------------------------------------------------------------

  /**
   * Retourne la liste ordonnée des providers à tenter pour cette requête,
   * après application de l'état du circuit-breaker.
   *
   * Règles :
   * - CLOSED → éligible
   * - OPEN + cooldown expiré → passe en HALF_OPEN (1 essai autorisé)
   * - OPEN + cooldown non expiré → skip
   * - HALF_OPEN + trial déjà utilisé → skip
   */
  decide(): RouteDecision {
    const now = Date.now();
    const ordered: LLMProvider[] = [];

    for (const name of this.priorityOrder) {
      if (!isProviderAvailable(name)) continue;
      const s = this.states[name];

      // Transition OPEN → HALF_OPEN si cooldown expiré
      if (s.state === 'OPEN' && s.cooldownEndsAt !== null && now >= s.cooldownEndsAt) {
        s.state = 'HALF_OPEN';
        s.halfOpenTrialUsed = false;
        s.cooldownEndsAt = null;
        log.info('router_half_open', { provider: name });
      }

      if (s.state === 'CLOSED') {
        ordered.push(name);
        continue;
      }
      if (s.state === 'HALF_OPEN' && !s.halfOpenTrialUsed) {
        ordered.push(name);
        // On marque le trial comme utilisé — si l'appel échoue, le circuit
        // repasse OPEN ; s'il réussit, il repasse CLOSED.
        s.halfOpenTrialUsed = true;
        continue;
      }
      // OPEN (cooldown non expiré) ou HALF_OPEN avec trial déjà consommé → skip
    }

    // Limiter au nombre maximum de providers à tenter
    const limited = ordered.slice(0, this.maxProvidersToTry);

    return {
      ordered: limited,
      snapshot: this.snapshot(limited[0] ?? null, limited.slice(1)),
    };
  }

  // --------------------------------------------------------------------
  // Signalement de succès / échec
  // --------------------------------------------------------------------

  recordSuccess(provider: LLMProvider, latencyMs: number): void {
    const s = this.states[provider];
    s.totalSuccess++;
    s.consecutiveFailures = 0;
    s.lastLatencyMs = latencyMs;
    s.lastError = null;
    if (s.state === 'HALF_OPEN') {
      s.state = 'CLOSED';
      s.halfOpenTrialUsed = false;
      s.cooldownEndsAt = null;
      log.info('router_recovered', { provider });
    }
  }

  recordFailure(provider: LLMProvider, error: Error, httpStatus?: number): void {
    const s = this.states[provider];
    s.totalFailures++;
    s.consecutiveFailures++;
    s.lastFailureAt = Date.now();
    s.lastLatencyMs = null;
    s.lastError = error.message.slice(0, 200);

    // 429 = rate-limit ; 503 = service overloaded → on ouvre immédiatement
    const isRateLimit = httpStatus === 429 || httpStatus === 503 || httpStatus === 529;
    const shouldOpen =
      isRateLimit ||
      s.consecutiveFailures >= this.failureThreshold;

    if (shouldOpen && s.state !== 'OPEN') {
      s.state = 'OPEN';
      s.cooldownEndsAt = Date.now() + this.cooldownMs;
      s.halfOpenTrialUsed = false;
      log.warn('router_circuit_opened', {
        provider,
        httpStatus: httpStatus ?? null,
        consecutiveFailures: s.consecutiveFailures,
        cooldownMs: this.cooldownMs,
        error: s.lastError,
      });
    }
  }

  // --------------------------------------------------------------------
  // Forcer la réinitialisation d'un provider (admin / dev)
  // --------------------------------------------------------------------

  resetProvider(provider: LLMProvider): void {
    const s = this.states[provider];
    s.state = 'CLOSED';
    s.consecutiveFailures = 0;
    s.cooldownEndsAt = null;
    s.halfOpenTrialUsed = false;
    s.lastError = null;
    log.info('router_reset', { provider });
  }

  resetAll(): void {
    for (const name of PROVIDER_NAMES) this.resetProvider(name);
  }

  // --------------------------------------------------------------------
  // Snapshot pour observabilité
  // --------------------------------------------------------------------

  snapshot(primary: LLMProvider | null, fallbacks: LLMProvider[]): RouterSnapshot {
    const now = Date.now();
    const providers: RouterProviderStats[] = PROVIDER_NAMES.map((name) => {
      const s = this.states[name];
      // Synchroniser OPEN → HALF_OPEN dans le snapshot aussi (best-effort)
      let state = s.state;
      let cooldownEndsAt = s.cooldownEndsAt;
      if (state === 'OPEN' && cooldownEndsAt !== null && now >= cooldownEndsAt) {
        state = 'HALF_OPEN';
        cooldownEndsAt = null;
      }
      return {
        name,
        state,
        consecutiveFailures: s.consecutiveFailures,
        totalSuccess: s.totalSuccess,
        totalFailures: s.totalFailures,
        lastFailureAt: s.lastFailureAt,
        cooldownEndsAt,
        lastError: s.lastError,
        lastLatencyMs: s.lastLatencyMs,
      };
    });

    return {
      primary: primary ?? 'groq',
      fallbacks,
      providers,
      snapshotAt: now,
    };
  }

  getSnapshot(): RouterSnapshot {
    return this.snapshot(this.priorityOrder[0], this.priorityOrder.slice(1));
  }

  // --------------------------------------------------------------------
  // Exécuter un appel LLM avec fallback automatique
  // --------------------------------------------------------------------

  async execute(
    request: LLMRequest,
    callFn: (
      provider: LLMProvider,
      cfg: ProviderConfig,
      request: LLMRequest,
      model?: string,
    ) => Promise<LLMResponse>,
    options: { tag?: string; providers?: LLMProvider[] } = {},
  ): Promise<LLMResponse> {
    // Si l'appelant force une liste de providers (options.providers), on
    // l'utilise comme ordre, mais on respecte toujours le circuit-breaker.
    let decision: RouteDecision;
    if (options.providers && options.providers.length > 0) {
      // Override local : on prend les providers demandés, filtrés par
      // disponibilité + circuit-breaker
      const originalOrder = this.priorityOrder;
      this.priorityOrderOverride = options.providers;
      decision = this.decide();
      this.priorityOrderOverride = originalOrder;
    } else {
      decision = this.decide();
    }

    if (decision.ordered.length === 0) {
      // Aucun provider disponible — tester si on peut forcer un half-open
      const availableClosedOrHalfOpen = PROVIDER_NAMES.filter((n) => isProviderAvailable(n));
      if (availableClosedOrHalfOpen.length === 0) {
        throw new Error(
          '[groq-router] Aucun provider LLM configuré. Définir au moins une clé API ' +
            '(GROQ_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.).',
        );
      }
      // Tous en OPEN — on attend le prochain cooldown.
      const nextRecovery = Math.min(
        ...availableClosedOrHalfOpen
          .map((n) => this.states[n].cooldownEndsAt ?? Infinity)
          .filter((v) => v !== null && Number.isFinite(v)),
      );
      throw new Error(
        `[groq-router] Tous les providers actifs sont en cooldown. ` +
          `Prochaine tentative dans ~${Math.max(0, Math.round((nextRecovery - Date.now()) / 1000))}s.`,
      );
    }

    let lastError: Error | null = null;

    for (const providerName of decision.ordered) {
      const cfg = getProviderConfig(providerName);
      if (!cfg) continue;

      try {
        const result = await callFn(providerName, cfg, request, request.model);
        this.recordSuccess(providerName, result.latencyMs);
        log.info('router_call_success', {
          provider: providerName,
          model: result.model,
          latencyMs: result.latencyMs,
          tokens: result.tokens,
          tag: options.tag,
        });
        // On attache le snapshot pour le caller (métriques)
        (result as LLMResponse & { _routerSnapshot?: RouterSnapshot })._routerSnapshot =
          decision.snapshot;
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        // Extraire le status HTTP si présent dans le message "[provider] HTTP 429: ..."
        const httpStatus = extractHttpStatus(lastError.message);
        this.recordFailure(providerName, lastError, httpStatus);
        log.warn('router_call_failed', {
          provider: providerName,
          httpStatus: httpStatus ?? null,
          error: lastError.message.slice(0, 200),
          tag: options.tag,
        });
        // Continuer vers le provider suivant
      }
    }

    throw new Error(
      `[groq-router] Tous les providers ont échoué. Dernière erreur: ${lastError?.message}`,
    );
  }

  // Hack: override temporaire de l'ordre de priorité (réinitialisé après decide())
  private priorityOrderOverride: LLMProvider[] | null = null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function extractHttpStatus(message: string): number | undefined {
  // Patterns : "HTTP 429", "HTTP 503", "(429)", "status=429"
  const m = message.match(/HTTP\s+(\d{3})|\((\d{3})\)|status\s*=\s*(\d{3})/i);
  if (!m) return undefined;
  return Number(m[1] || m[2] || m[3]);
}

// ─── Singleton ─────────────────────────────────────────────────────────────

let routerInstance: GroqPreferredRouter | null = null;

export function getGroqRouter(): GroqPreferredRouter {
  if (!routerInstance) {
    routerInstance = new GroqPreferredRouter({
      priorityOrder: ['groq', 'openai', 'anthropic', 'openrouter', 'huggingface'],
      failureThreshold: 3,
      cooldownMs: 60_000, // 1 minute — Groq reprend après 1 min de repos
      perProviderTimeoutMs: 30_000,
      maxProvidersToTry: 4,
    });
  }
  return routerInstance;
}

// Override du priorityOrder (used by options.providers)
// On patche decide() pour utiliser priorityOrderOverride si présent.
const originalDecide = GroqPreferredRouter.prototype.decide;
GroqPreferredRouter.prototype.decide = function (): RouteDecision {
  if ((this as any).priorityOrderOverride && (this as any).priorityOrderOverride.length > 0) {
    const original = (this as any).priorityOrder;
    (this as any).priorityOrder = (this as any).priorityOrderOverride;
    const result = originalDecide.call(this);
    (this as any).priorityOrder = original;
    return result;
  }
  return originalDecide.call(this);
};

export const groqRouter = getGroqRouter();
export default groqRouter;
