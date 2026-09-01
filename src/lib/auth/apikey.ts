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

// ---------- Limiteur de débit (v3.1 : unifié avec security/rate-limit) ----------

import { enforceRateLimit } from "@/lib/security/rate-limit"

/**
 * 60 requêtes/minute par clé API — même politique qu'avant, mais gérée par
 * le limiteur unifié (token bucket, partagé avec les dimensions ip/user).
 */
export function checkRateLimit(keyId: string): void {
  enforceRateLimit("apiKey", keyId)
}
