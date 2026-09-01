import type { NextRequest } from "next/server"
import type { User } from "@prisma/client"
import { db } from "@/lib/db"
import { ApiError } from "@/lib/api"
import { SESSION_COOKIE, getSessionUser } from "./session"

/**
 * Garde d'authentification pour les routes API du tableau de bord.
 * Session cookie httpOnly obligatoire.
 */
export async function requireUser(req: NextRequest): Promise<User> {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  const user = await getSessionUser(token)
  if (!user) {
    throw new ApiError(401, "Authentification requise. Connectez-vous.", "UNAUTHENTICATED")
  }
  return user
}

export async function requireAdmin(req: NextRequest): Promise<User> {
  const user = await requireUser(req)
  if (user.role !== "ADMIN") {
    throw new ApiError(403, "Accès réservé aux administrateurs.", "FORBIDDEN")
  }
  return user
}

export { SESSION_COOKIE }

/** Récupère l'utilisateur courant sans lever d'erreur (null si non connecté). */
export async function optionalUser(req: NextRequest): Promise<User | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  return getSessionUser(token)
}

/** Préférences utilisateur fusionnées avec les valeurs par défaut. */
export interface UserSettings {
  defaultProvider: string
  defaultModel: string
  maxAttempts: number
  confirmDangerousOps: boolean
  language: string
  /** v3.1 — mode Explain : « manual » exige l'approbation du plan avant exécution. */
  planApproval: "auto" | "manual"
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  defaultProvider: "auto",
  defaultModel: "auto",
  maxAttempts: 3,
  confirmDangerousOps: true,
  language: "fr",
  planApproval: "auto",
}

export function getUserSettings(user: User): UserSettings {
  let parsed: Partial<UserSettings> = {}
  try {
    parsed = user.settings ? JSON.parse(user.settings) : {}
  } catch {
    parsed = {}
  }
  return { ...DEFAULT_USER_SETTINGS, ...parsed }
}
