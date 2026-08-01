// ============================================================
// Gen3ia — withAuth() : wrapper unique de sécurité pour les routes API
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
import { checkTokenLimit, getPlanLimits } from '@/lib/usage-limits';
import { db } from '@/lib/db';

/** Type des params Next.js (remplace `Promise<any>`) */
export type RouteParams = Promise<Record<string, string | string[]>>;

export interface AuthContext extends SecurityContext {
}

export interface WithAuthOptions {
  requireAuth?: boolean;
  roles?: string[];
  rateLimit?: {
    limit: number;
    windowMs: number;
  };
  quota?: boolean;
  scopes?: string[];
}

type HandlerWithAuth<Ctx extends { params?: RouteParams }> = (request: NextRequest, ctx: Ctx, auth: SecurityContext) => Promise<NextResponse | Response>;

/**
 * Wrapper de sécurité réutilisable pour toutes les routes API.
 * Combine auth + RBAC + rate limit + quota.
 */
export function withAuth<Ctx extends { params?: RouteParams }>(
  handler: HandlerWithAuth<Ctx>,
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
      const user = await db.user.findUnique({
        where: { id: auth.userId },
        select: { plan: true, credits: true },
      });
      if (!user) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 401 });

      if (user.credits <= 0 && user.plan !== 'free') {
        return NextResponse.json(
          { error: 'Quota de crédits épuisé. Rechargez vos crédits.' },
          { status: 402 }
        );
      }

      const tokenLimit = await checkTokenLimit(auth.userId, user.plan);
      if (!tokenLimit.allowed) {
        const planLimits = getPlanLimits(user.plan);
        return NextResponse.json(
          { error: `Quota LLM journalier atteint (${tokenLimit.current}/${tokenLimit.limit}). Dépasse le seuil de ${planLimits.maxTokensPerDay} tokens.` },
          { status: 429 }
        );
      }
    }

    // 4. Exécuter le handler avec le contexte d'auth
    if (!auth) return NextResponse.json({ error: 'Authentification requise' }, { status: 401 });
    return handler(request, context, auth);
  };
}

export type { SecurityContext };
export { db } from '@/lib/db';

// Alias pour réduire le boilerplate sur les routes simples
export const requireAuth = <Ctx extends { params?: RouteParams }>(
  handler: HandlerWithAuth<Ctx>,
  opts: Omit<WithAuthOptions, 'requireAuth'> = {}
) => withAuth(handler, { ...opts, requireAuth: true });

export const optionalAuth = <Ctx extends { params?: RouteParams }>(
  handler: HandlerWithAuth<Ctx>,
  opts: Omit<WithAuthOptions, 'requireAuth'> = {}
) => withAuth(handler, { ...opts, requireAuth: false });
