// ============================================================
// Gen3ia — withAuth() : wrapper unique de sécurité pour les 245 routes API
//
// 2ème couche de défense (le middleware est la 1ère).
// - Authentification : JWT / API Key / Bearer
// - RBAC : rôles requis (admin, user, ...)
// - Rate limiting : Redis (distribué) + fallback mémoire
// - Quota LLM : vérifie le plan + le quota utilisateur
//
// Usage :
//   export const POST = withAuth(async (req, { auth, context }) => {
//     // ... votre handler
//   }, { roles: ['user'], rateLimit: { limit: 20, windowMs: 60000 } });
//
//   export const GET = withAuth(handler, { requireAuth: false });
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, type SecurityContext } from '@/lib/security';
import { rateLimit } from '@/lib/rate-limiter';
import { checkQuota } from '@/lib/usage-limits';

// Types exportés pour les handlers
export interface AuthContext extends SecurityContext {
  // contexte étendu si besoin
}

export interface WithAuthOptions {
  requireAuth?: boolean;
  roles?: string[];
  rateLimit?: {
    limit: number;
    windowMs: number;
  };
  /**
   * Activer la vérification de quota (crédits LLM).
   * À utiliser sur les routes qui consomment des ressources LLM (chat, generate, etc.)
   */
  quota?: boolean;
  /**
   * Scope requis (ex: 'read', 'write', 'admin').
   * Non utilisé pour l'instant, extensible.
   */
  scopes?: string[];
}

type HandlerWithAuth = (request: NextRequest, ctx: { params?: Promise<any> }) => Promise<NextResponse | Response>;

/**
 * Wrapper de sécurité réutilisable pour toutes les routes API.
 * Combine auth + RBAC + rate limit + quota.
 */
export function withAuth<Ctx extends { params?: Promise<any> }>(
  handler: (request: NextRequest, context: Ctx, auth: SecurityContext) => Promise<NextResponse | Response>,
  options: WithAuthOptions = {}
) {
  const {
    requireAuth = true,
    roles,
    rateLimit: rlOptions,
    quota = false,
  } = options;

  return async function wrappedHandler(request: NextRequest, context: Ctx): Promise<NextResponse | Response> {
    // 1. Authentification + RBAC
    const { auth, error } = await applySecurity(request, { requireAuth, roles });
    if (error) return error;

    // 2. Rate limiting (Redis distribué, ou fallback mémoire)
    if (rlOptions) {
      const { allowed, remaining, resetIn } = await rateLimit(request, auth?.userId);
      if (!allowed) {
        return NextResponse.json(
          { error: 'Trop de requêtes', remaining, resetIn },
          { status: 429 }
        );
      }
    }

    // 3. Quota LLM / crédits (sur les routes coûteuses)
    if (quota && auth?.userId) {
      const user = await getUserPlanAndCredits(auth.userId);
      if (user && user.credits <= 0 && user.plan === 'free') {
        return NextResponse.json(
          { error: 'Quota de crédits épuisé. Passez à un plan supérieur.' },
          { status: 402 }
        );
      }
      if (user) {
        const quotaCheck = await checkQuota(auth.userId, user.plan);
        if (!quotaCheck.allowed) {
          return NextResponse.json(
            { error: `Quota LLM journalier atteint (${quotaCheck.current}/${quotaCheck.limit})` },
            { status: 429 }
          );
        }
      }
    }

    // 4. Exécuter le handler avec le contexte d'auth
    return handler(request, context, auth!);
  };
}

// Helpers internes
async function getUserPlanAndCredits(userId: string) {
  try {
    const { db } = await import('@/lib/db');
    return db.user.findUnique({
      where: { id: userId },
      select: { plan: true, credits: true },
    });
  } catch {
    return null;
  }
}

// Re-export de SecurityContext pour compatibilité
export type { SecurityContext };

// Alias pour réduire le boilerplate sur les routes simples
export const requireAuth = (handler: HandlerWithAuth, opts: Omit<WithAuthOptions, 'requireAuth'> = {}) =>
  withAuth(handler as any, { ...opts, requireAuth: true });

export const optionalAuth = (handler: HandlerWithAuth, opts: Omit<WithAuthOptions, 'requireAuth'> = {}) =>
  withAuth(handler as any, { ...opts, requireAuth: false });
