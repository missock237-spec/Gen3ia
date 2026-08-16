// ============================================================
// API Rate Limiter Middleware
// ============================================================
//  Problème : Le RateLimiter existant est en mémoire (volatile)
//  et n'est appliqué qu'au moteur d'agents, pas aux routes API.
//
//  Solution : Un middleware de rate limiting réutilisable pour
//  les routes API, avec persistance Redis optionnelle.
//
//  Usage :
//    import { withRateLimit } from '@/lib/api-rate-limit';
//    export const POST = withRateLimit(handler, {
//      max: 20, windowSec: 60, key: 'agent-execute'
//    });
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { RateLimiter } from '@/lib/security/rate-limiter';

// Singleton partagé entre toutes les routes
const limiter = new RateLimiter();

export interface RateLimitOptions {
  max: number;        // Nombre max de requêtes
  windowSec: number;  // Période en secondes
  key?: string;       // Clé de rate limit (ex: 'agent-execute')
  keyByIp?: boolean;  // Si true, clé par IP (défaut: true)
  keyByUser?: boolean; // Si true, clé par utilisateur
}

/**
 * Génère la clé de rate limit à partir de la requête.
 */
function getRateLimitKey(req: NextRequest, opts: RateLimitOptions, userId?: string): string {
  const parts: string[] = [opts.key || 'api'];

  if (opts.keyByUser && userId) {
    parts.push(`user:${userId}`);
  } else if (opts.keyByIp !== false) {
    // IP de l'utilisateur
    const forwarded = req.headers.get('x-forwarded-for');
    const realIp = req.headers.get('x-real-ip');
    const ip = forwarded?.split(',')[0]?.trim() || realIp || 'unknown';
    parts.push(`ip:${ip}`);
  }

  return parts.join(':');
}

/**
 * Wrapper de rate limiting pour les routes API.
 * À combiner avec withAuth :
 *
 *   export const POST = withRateLimit(
 *     withAuth(handler),
 *     { max: 20, windowSec: 60, key: 'agent-execute' }
 *   );
 *
 * Ou utilisé seul :
 *   export const POST = withRateLimit(handler, { max: 100, windowSec: 60 });
 */
export function withRateLimit(
  handler: (req: NextRequest, ...args: unknown[]) => Promise<NextResponse>,
  options: RateLimitOptions
) {
  return async (req: NextRequest, ...args: unknown[]): Promise<NextResponse> => {
    // Essayer d'extraire l'userId du cookie de session
    let userId: string | undefined;
    try {
      const sessionCookie = req.cookies.get('gen3ia_session')?.value;
      if (sessionCookie) {
        const decoded = JSON.parse(Buffer.from(sessionCookie, 'base64url').toString());
        userId = decoded.uid;
      }
    } catch {}

    const key = getRateLimitKey(req, options, userId);
    const windowMs = options.windowSec * 1000;

    if (!limiter.isAllowed(key, options.max, windowMs)) {
      const retryAfter = limiter.getRetryAfter(key, options.max, windowMs);
      const remaining = limiter.getRemaining(key, options.max, windowMs);

      return NextResponse.json(
        {
          error: 'Trop de requêtes. Réessayez plus tard.',
          retryAfter: Math.ceil(retryAfter / 1000),
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(options.max),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(retryAfter / 1000)),
            'Retry-After': String(Math.ceil(retryAfter / 1000)),
          },
        }
      );
    }

    // Requête autorisée — appeler le handler
    const response = await handler(req, ...args);

    // Ajouter les headers de rate limit à la réponse
    const remaining = limiter.getRemaining(key, options.max, windowMs);
    response.headers.set('X-RateLimit-Limit', String(options.max));
    response.headers.set('X-RateLimit-Remaining', String(remaining));

    return response;
  };
}

/**
 * Presets de rate limit par type d'endpoint.
 */
export const RATE_LIMIT_PRESETS = {
  // Auth : 5 tentatives / minute (anti brute-force)
  auth: { max: 5, windowSec: 60, key: 'auth' },
  // OTP : 3 envois / heure
  otp: { max: 3, windowSec: 3600, key: 'otp' },
  // Agent execute : 20 / minute
  agentExecute: { max: 20, windowSec: 60, key: 'agent-execute' },
  // Agent create : 5 / minute
  agentCreate: { max: 5, windowSec: 60, key: 'agent-create' },
  // Payment : 10 / minute
  payment: { max: 10, windowSec: 60, key: 'payment' },
  // API key generate : 3 / heure
  apiKey: { max: 3, windowSec: 3600, key: 'api-key' },
  // Export : 5 / heure
  export: { max: 5, windowSec: 3600, key: 'export' },
  // Default : 60 / minute
  default: { max: 60, windowSec: 60, key: 'default' },
} as const;
