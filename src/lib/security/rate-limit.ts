import { AppError } from "@/lib/errors"

/**
 * Rate limiting unifié (amélioration « Sécurité »).
 *
 * Limites de débit à jetons (token bucket) par dimension :
 *  - ip:      endpoints non authentifiés (login, register, webhook, santé) ;
 *  - user:    routes session-authentifiées (UI) ;
 *  - apikey:  routes /api/v1 (clé API) — remplace et unifie l'ancien
 *             limiteur ad hoc de apikey.ts (60 req/min, conservé).
 *
 * Implémentation en mémoire par instance (aucune dépendance externe,
 * zéro latence réseau). Sur serverless multi-instances, la limite est
 * effective par instance : en pratique cela divise le débit autorisé de
 * façon conservatrice — un backend Redis (REDIS_URL) peut être branché
 * plus tard sans changer l'interface publique.
 */

export interface RateLimitPolicy {
  /** Capacité du seau (requêtes autorisées en rafale). */
  limit: number
  /** Fenêtre en secondes pendant laquelle la capacité se renouvelle. */
  windowSeconds: number
}

export const RATE_POLICIES = {
  /** Endpoints non authentifiés sensibles (login). */
  auth: { limit: 10, windowSeconds: 60 },
  /** Création de compte (anti-abus strict). */
  register: { limit: 5, windowSeconds: 3600 },
  /** Webhooks entrants (Chariow). */
  webhook: { limit: 120, windowSeconds: 60 },
  /** Routes authentifiées session (UI). */
  user: { limit: 120, windowSeconds: 60 },
  /** Clés API /api/v1 — politique historique conservée. */
  apiKey: { limit: 60, windowSeconds: 60 },
  /** Fallback IP pour toute route sans authentification. */
  ip: { limit: 60, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitPolicy>

export type RateLimitPolicyName = keyof typeof RATE_POLICIES

interface Bucket {
  tokens: number
  resetAt: number
}

const g = globalThis as unknown as { gen3iaRateBuckets?: Map<string, Bucket> }

function buckets(): Map<string, Bucket> {
  if (!g.gen3iaRateBuckets) g.gen3iaRateBuckets = new Map()
  return g.gen3iaRateBuckets
}

/** Purge paresseuse : évite la croissance non bornée de la map. */
function purgeIfNeeded(map: Map<string, Bucket>) {
  if (map.size <= 10_000) return
  const now = Date.now()
  for (const [key, bucket] of map) {
    if (bucket.resetAt <= now) map.delete(key)
  }
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

/** Vérifie et consomme 1 jeton pour la politique donnée. */
export function checkRateLimit(
  scope: RateLimitPolicyName,
  identifier: string
): RateLimitResult {
  const policy = RATE_POLICIES[scope]
  const map = buckets()
  purgeIfNeeded(map)
  const key = `${scope}:${identifier}`
  const now = Date.now()
  const windowMs = policy.windowSeconds * 1000

  const bucket = map.get(key)
  if (!bucket || bucket.resetAt <= now) {
    const fresh: Bucket = { tokens: policy.limit - 1, resetAt: now + windowMs }
    map.set(key, fresh)
    return { allowed: true, remaining: fresh.tokens, resetAt: fresh.resetAt }
  }

  if (bucket.tokens <= 0) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt }
  }

  bucket.tokens -= 1
  return { allowed: true, remaining: bucket.tokens, resetAt: bucket.resetAt }
}

/** Variante lançant une ApiError 429 avec Retry-After — utilisée dans les routes. */
export function enforceRateLimit(
  scope: RateLimitPolicyName,
  identifier: string
): RateLimitResult {
  const result = checkRateLimit(scope, identifier)
  if (!result.allowed) {
    const retryAfterSeconds = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))
    const err = new AppError("RATE_LIMITED", {
      context: { scope, retryAfterSeconds },
    })
    ;(err as AppError & { retryAfter?: number }).retryAfter = retryAfterSeconds
    throw err
  }
  return result
}

/** Snapshot d'inspection (tests, admin). */
export function rateLimitSnapshot(): Array<{ key: string; tokens: number; resetAt: number }> {
  return [...buckets().entries()].map(([key, bucket]) => ({
    key,
    tokens: bucket.tokens,
    resetAt: bucket.resetAt,
  }))
}
