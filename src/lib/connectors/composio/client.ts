/**
 * GEN3IA × Composio — client SDK hébergé (côté serveur UNIQUEMENT).
 *
 * Intégration officielle du SDK `@composio/core` : lorsque la clé API
 * Composio est configurée (environnement `COMPOSIO_API_KEY` ou secret
 * de plateforme chiffré en base), les 300+ apps gérées par Composio
 * deviennent connectables en un clic (OAuth opéré par Composio) et
 * exécutables par les agents via `composio.tools.execute`.
 *
 * Règles de sécurité :
 * - la clé API n'est JAMAIS renvoyée au client (aucune route ne la sérialise) ;
 * - la clé stockée en base est chiffrée AES-256-GCM (core/crypto) ;
 * - l'instance SDK est mise en cache par valeur de clé (rotation sans redeploiement) ;
 * - chaque appel réseau est borné par un timeout explicite.
 *
 * Ce module n'est importé que par du code serveur (routes API / lib).
 */

import { Composio } from "@composio/core"
import { db } from "@/lib/db"
import { logger } from "@/lib/observability/logger"
import { decryptJson, encryptJson } from "../core/crypto"

/** Nom logique du secret Composio en base (table PlatformSecret). */
export const COMPOSIO_SECRET_KEY = "composio"

/** Variable d'environnement prioritaire. */
const COMPOSIO_ENV_VAR = "COMPOSIO_API_KEY"

/** Base URL surchargeable (Composio cloud par défaut). */
const COMPOSIO_BASE_URL = process.env.COMPOSIO_BASE_URL || undefined

/** Timeout par défaut des appels vers l'API Composio. */
const COMPOSIO_TIMEOUT_MS = 15_000

// ─────────────────────────────────────────────────────────────
// Résolution de la clé API (env > base chiffrée)
// ─────────────────────────────────────────────────────────────

interface ResolvedKey {
  key: string | null
  source: "env" | "db" | null
}

/** Cache de résolution (60 s) — évite une lecture DB à chaque appel. */
const KEY_CACHE: { value: ResolvedKey | null; at: number; ttlMs: number } = {
  value: null,
  at: 0,
  ttlMs: 60_000,
}

/** Invalide le cache de clé (appelé après écriture admin). */
export function invalidateComposioKeyCache(): void {
  KEY_CACHE.value = null
  KEY_CACHE.at = 0
  CLIENT_CACHE.clear()
}

/**
 * Résout la clé API Composio :
 * 1. `COMPOSIO_API_KEY` (environnement — prioritaire, recommandé en prod) ;
 * 2. secret de plateforme chiffré en base (rotation sans redeploiement).
 */
export async function resolveComposioKey(): Promise<ResolvedKey> {
  const envKey = process.env[COMPOSIO_ENV_VAR]
  if (envKey && envKey.trim().length >= 8) {
    return { key: envKey.trim(), source: "env" }
  }

  const now = Date.now()
  if (KEY_CACHE.value && now - KEY_CACHE.at < KEY_CACHE.ttlMs) {
    return KEY_CACHE.value
  }

  let resolved: ResolvedKey = { key: null, source: null }
  try {
    const row = await db.platformSecret.findUnique({ where: { key: COMPOSIO_SECRET_KEY } })
    if (row) {
      const value = decryptJson<{ apiKey: string }>(row.encryptedValue)
      if (value.apiKey && value.apiKey.trim().length >= 8) {
        resolved = { key: value.apiKey.trim(), source: "db" }
      }
    }
  } catch (err) {
    // Base indisponible (build, cold start) : dégradation silencieuse vers « non configuré ».
    logger.warn("composio: lecture du secret plateforme impossible", {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  KEY_CACHE.value = resolved
  KEY_CACHE.at = now
  return resolved
}

/** Composio est-il configuré (clé présente) ? */
export async function isComposioConfigured(): Promise<boolean> {
  return (await resolveComposioKey()).key !== null
}

// ─────────────────────────────────────────────────────────────
// Instance SDK (cache par clé)
// ─────────────────────────────────────────────────────────────

/** Cache d'instance : une seule instance SDK par clé active. */
const CLIENT_CACHE = new Map<string, Composio>()

/**
 * Retourne l'instance SDK Composio (ou null si non configuré).
 * L'instance est reconstruite si la clé change (rotation admin).
 */
export async function getComposioClient(): Promise<Composio | null> {
  const { key } = await resolveComposioKey()
  if (!key) return null

  const cached = CLIENT_CACHE.get(key)
  if (cached) return cached

  try {
    const client = new Composio({
      apiKey: key,
      ...(COMPOSIO_BASE_URL ? { baseURL: COMPOSIO_BASE_URL } : {}),
      allowTracking: false,
    })
    CLIENT_CACHE.set(key, client)
    // Cache borné : au plus 2 instances (rotation en cours inclus).
    if (CLIENT_CACHE.size > 2) {
      const oldest = CLIENT_CACHE.keys().next().value
      if (oldest !== undefined && oldest !== key) CLIENT_CACHE.delete(oldest)
    }
    return client
  } catch (err) {
    logger.error("composio: initialisation du SDK impossible", {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/** Options de requête standard (timeout + signal d'annulation). */
export function composioRequestOptions(): { signal: AbortSignal } {
  return { signal: AbortSignal.timeout(COMPOSIO_TIMEOUT_MS) }
}

// ─────────────────────────────────────────────────────────────
// Gestion du secret (admin)
// ─────────────────────────────────────────────────────────────

/**
 * Enregistre la clé API Composio en base (chiffrée AES-256-GCM).
 * L'environnement reste prioritaire : la clé en base ne s'applique
 * que si `COMPOSIO_API_KEY` est absent.
 */
export async function setComposioKey(apiKey: string, createdBy: string): Promise<void> {
  const trimmed = apiKey.trim()
  if (trimmed.length < 8) {
    throw new Error("Clé API Composio invalide (longueur minimale : 8).")
  }
  const encrypted = encryptJson({ apiKey: trimmed })
  await db.platformSecret.upsert({
    where: { key: COMPOSIO_SECRET_KEY },
    create: {
      key: COMPOSIO_SECRET_KEY,
      encryptedValue: encrypted,
      createdBy,
      meta: JSON.stringify({ hint: `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}` }),
    },
    update: { encryptedValue: encrypted, createdBy, updatedAt: new Date() },
  })
  invalidateComposioKeyCache()
  logger.info("composio: clé API enregistrée (chiffrée AES-256-GCM)")
}

/** Supprime le secret plateforme (repli sur l'environnement uniquement). */
export async function clearComposioKey(): Promise<boolean> {
  const row = await db.platformSecret.deleteMany({ where: { key: COMPOSIO_SECRET_KEY } })
  invalidateComposioKeyCache()
  return row.count > 0
}

// ─────────────────────────────────────────────────────────────
// Mapping d'identifiants utilisateurs
// ─────────────────────────────────────────────────────────────

/**
 * Mappe un utilisateur GEN3IA vers son identifiant Composio stable.
 * Préfixe explicite pour distinguer les utilisateurs GEN3IA dans le
 * dashboard Composio (conformité/audit), identifiant inchangé entre
 * les appels (sessions/connexions persistées côté Composio).
 */
export function composioUserId(userId: string): string {
  return `gen3ia-u-${userId}`
}

/** Normalise les messages d'erreur SDK Composio. */
export function composioErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
