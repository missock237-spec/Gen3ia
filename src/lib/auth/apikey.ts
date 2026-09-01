import type { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ApiError } from "@/lib/api"
import { verifyApiKey } from "@/lib/sdk/keys"
import type { ApiKey, Agent, User } from "@prisma/client"

/**
 * Authentification par clé API pour l'API publique v1 (/api/v1/*).
 * Format : Authorization: Bearer g3ia_live_...
 * Seul le SHA-256 est comparé ; le secret n'est jamais stocké ni journalisé.
 */

export interface ApiKeyContext {
  user: User
  apiKey: ApiKey
  agent: Agent | null // agent lié à la clé (si défini)
}

export async function authenticateApiKey(req: NextRequest): Promise<ApiKeyContext> {
  const header = req.headers.get("authorization") ?? ""
  const secret = header.replace(/^Bearer\s+/i, "").trim()
  if (!secret.startsWith("g3ia_live_")) {
    throw new ApiError(401, "Clé API manquante ou invalide. Utilisez : Authorization: Bearer g3ia_live_...", "BAD_API_KEY")
  }

  // La clé liée à un agent est identifiée par son préfixe affichable.
  const prefix = secret.slice(0, 16)
  const candidates = await db.apiKey.findMany({
    where: { prefix, revoked: false },
    include: { user: true },
  })
  const match = candidates.find((k) => verifyApiKey(secret, k.keyHash))
  if (!match) {
    throw new ApiError(401, "Clé API inconnue ou révoquée.", "BAD_API_KEY")
  }

  // Compteur d'utilisation + dernier appel.
  await db.apiKey.update({
    where: { id: match.id },
    data: { requests: { increment: 1 }, lastUsedAt: new Date() },
  })

  let agent: Agent | null = null
  if (match.agentId) {
    agent = await db.agent.findUnique({ where: { id: match.agentId } })
  }

  return { user: match.user, apiKey: match, agent }
}

/** Résout un agent demandé explicitement (agent_slug) ou celui de la clé. */
export async function resolveAgent(
  ctx: ApiKeyContext,
  agentSlug?: string
): Promise<Agent> {
  if (agentSlug) {
    const agent = await db.agent.findUnique({ where: { slug: agentSlug } })
    if (!agent || agent.status !== "PUBLISHED") {
      throw new ApiError(404, "Agent publié introuvable pour ce slug.", "AGENT_NOT_FOUND")
    }
    return agent
  }
  if (ctx.agent) return ctx.agent
  throw new ApiError(
    400,
    "Aucun agent spécifié : fournissez agent_slug ou utilisez une clé liée à un agent.",
    "AGENT_REQUIRED"
  )
}

// ---------- Limiteur de débit en mémoire (par clé) ----------

const RATE_LIMIT = 60 // requêtes
const RATE_WINDOW_MS = 60_000 // par minute

const buckets = new Map<string, { count: number; resetAt: number }>()

export function checkRateLimit(keyId: string): void {
  const now = Date.now()
  const bucket = buckets.get(keyId)
  if (!bucket || bucket.resetAt < now) {
    buckets.set(keyId, { count: 1, resetAt: now + RATE_WINDOW_MS })
    // Purge paresseuse pour éviter la croissance non bornée.
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) {
        if (v.resetAt < now) buckets.delete(k)
      }
    }
    return
  }
  bucket.count++
  if (bucket.count > RATE_LIMIT) {
    const retryIn = Math.ceil((bucket.resetAt - now) / 1000)
    throw new ApiError(
      429,
      `Limite de débit atteinte (${RATE_LIMIT} requêtes/minute). Réessayez dans ${retryIn} s.`,
      "RATE_LIMITED"
    )
  }
}
