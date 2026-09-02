import { db } from "@/lib/db"
import type { Role, Permission } from "@/lib/engines/types"
import { logger } from "@/lib/observability/logger"

/**
 * RBAC Granulaire — Système de contrôle d'accès basé sur les rôles.
 * Rôles : ADMIN, AGENT_MANAGER, USER
 * Permissions fines par ressource : task, agent, knowledge, billing, admin, system.
 */

// Définition statique des permissions par rôle
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: [
    "task.execute", "task.view", "task.view_logs",
    "agent.manage", "agent.deploy", "agent.view",
    "knowledge.manage", "billing.access", "admin.access",
    "system.config", "webhook.manage",
  ],
  AGENT_MANAGER: [
    "task.execute", "task.view", "task.view_logs",
    "agent.manage", "agent.deploy", "agent.view",
    "knowledge.manage", "webhook.manage",
  ],
  USER: [
    "task.execute", "task.view",
    "agent.view",
  ],
}

/**
 * Vérifie si un rôle possède une permission.
 */
export function hasPermission(role: string, permission: Permission): boolean {
  const rolePermissions = ROLE_PERMISSIONS[role as Role]
  if (!rolePermissions) return false
  return rolePermissions.includes(permission)
}

/**
 * Vérifie une permission et lève une erreur si non autorisé.
 */
export function requirePermission(role: string, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    logger.warn("Permission refusée", { role, permission })
    throw new RBACError(`Permission refusée : ${permission} requis pour le rôle ${role}`)
  }
}

/**
 * Récupère toutes les permissions d'un rôle.
 */
export function getRolePermissions(role: string): Permission[] {
  return ROLE_PERMISSIONS[role as Role] ?? []
}

/**
 * Vérifie si un utilisateur peut accéder à une ressource d'un autre utilisateur.
 */
export function canAccessResource(userRole: string, resourceOwnerId: string, currentUserId: string): boolean {
  if (userRole === "ADMIN") return true
  if (userRole === "AGENT_MANAGER") return true
  return resourceOwnerId === currentUserId
}

export class RBACError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RBACError"
  }
}
