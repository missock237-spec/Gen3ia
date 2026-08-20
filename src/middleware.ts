// ✅ CODE CORRIGÉ — Implémenter le middleware
import { NextRequest, NextResponse } from 'next/server';
import { getSessionCookieFromRequest } from '@/lib/firebase/auth';

// Routes publiques qui ne nécessitent pas d'authentification
const PUBLIC_ROUTES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/verify-email',
  '/api/auth/send-verification',
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  
  // Headers de sécurité sur toutes les réponses
  const response = NextResponse.next();
  applySecurityHeaders(response);
  
  // Skip pour les routes publiques
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return response;
  }
  
  // Vérifier l'authentification pour les autres routes /api/*
  if (pathname.startsWith('/api/')) {
    const sessionCookie = getSessionCookieFromRequest(req);
    const authHeader = req.headers.get('authorization');
    const apiKey = req.headers.get('x-api-key');
    
    if (!sessionCookie && !authHeader && !apiKey) {
      return NextResponse.json(
        { error: 'Authentification requise' },
        { status: 401 }
      );
    }
  }
  
  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};
import { SESSION_COOKIE_NAME } from '@/lib/firebase/config';
import { generateCspNonce, buildCspHeader } from '@/lib/csp';
import { getSecurityHeaders } from '@/lib/security-headers';
import {
  getApiVersion,
  isVersionSupported,
  getSunsetHeaderValue,
  CURRENT_API_VERSION,
  SUPPORTED_API_VERSIONS,
} from '@/lib/api-version';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// P1 — Rate limiting (roadmap qualité). Edge-safe : store mémoire/Redis injecté.
import { rateLimit } from '@/lib/security/rate-limit';

// Quotas de rate limiting (P1). Les clés API ont un quota supérieur.
const RL_WINDOW_SEC = 60;
const RL_MAX_ANON = 120;    // IP / session anonyme : 120 req/min
const RL_MAX_APIKEY = 1000; // clé API validée : 1000 req/min

// Routes publiques LISTÉES ROUTE PAR ROUTE.
const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/verify-email',
  '/api/auth/send-verification',
  // /api/auth/me est publique : un client non authentifié doit pouvoir
  // demander "est-ce que j'ai une session?" pour décider d'afficher le
  // dashboard ou la landing. La route retourne { user: null } si pas de
  // session valide — ce qui est une réponse publique, pas une fuite.
  '/api/auth/me',
  '/api/auth/session',
  '/api/health',
  '/api/health/features',
  '/api/register',
  '/api/webhook/stripe',
  '/api/webhook/sebpay',
  '/api/webhooks/stripe',
  '/api/webhooks/sebpay',
  '/api/webhooks/chariow',
  '/api/events/sse',
  '/api/docs',
  '/api/docs/openapi.json',
  '/api/public/',
  '/api/version',
];

// Routes ADMIN : exigent TOUJOURS le rôle 'admin' (custom claim Firebase).
const ADMIN_ROUTES = [
  '/api/admin/',
  '/api/terminal/execute',
  '/api/services/',
  '/api/keys/',
  '/api/metrics/',
  '/api/monitoring/',
  '/api/system/',
  // Evolution Engine — privileged: only admins can trigger/rollback/approve
  '/api/evolution/',
];

// Routes sensibles (LLM coûteux) : vérifiées par withAuth (couche 2).
const SENSITIVE_RESOURCE_ROUTES = [
  '/api/ai-server/',
  '/api/ai/',
  '/api/audio/',
  '/api/analytics/',
  '/api/media/',
  '/api/images/',
  '/api/videos/',
  '/api/multimodal/',
  '/api/generation/',
  '/api/llm/',
  '/api/rag/',
  '/api/compute/',
  '/api/browser/',
];

const IS_PROD = process.env.NODE_ENV === 'production';

function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(route.endsWith('/') ? route : route + '/');
}

/**
 * Vérifie la présence d'un session cookie Firebase SANS importer firebase-admin
 * (interdit en Edge Runtime — voir build Next.js). La vérification
 * cryptographique est reportée sur la couche 2 (withAuth) qui s'exécute en
 * Node.js Runtime. Ici on ne fait qu'une vérification de présence pour
 * court-circuiter les requêtes sans aucune auth.
 */
async function verifyFirebaseSession(cookieValue: string | undefined): Promise<{ uid: string; role: string } | null> {
  if (!cookieValue) return null;
  try {
    // Edge-safe : on décode juste le JWT (pas de vérif crypto — la couche 2 le fait)
    const parts = cookieValue.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    const role = (payload.role as string) || 'user';
    return { uid: payload.uid || payload.sub || '', role };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- Security headers + CSP (nonce per-request) ---
  const nonce = generateCspNonce();
  const csp = buildCspHeader(nonce);
  const securityHeaders = getSecurityHeaders(IS_PROD);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Appliquer tous les en-têtes de sécurité
  for (const [key, value] of Object.entries(securityHeaders)) {
    response.headers.set(key, value);
  }
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('x-nonce', nonce);

  // 1. Fichiers statiques
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon') ||
      pathname === '/icon.svg' || pathname === '/sw.js' || pathname === '/manifest.json') {
    return response;
  }

  // 2. Routes non-API
  if (!pathname.startsWith('/api/')) {
    return response;
  }

  // 2.a — Versioning API
  const apiVersion = getApiVersion(request);

  if (!isVersionSupported(apiVersion)) {
    const errorRes = NextResponse.json(
      {
        error: `Unsupported API version: ${apiVersion}`,
        supportedVersions: SUPPORTED_API_VERSIONS,
        currentVersion: CURRENT_API_VERSION,
      },
      { status: 400, headers: response.headers }
    );
    errorRes.headers.set('X-API-Version', CURRENT_API_VERSION);
    return errorRes;
  }

  requestHeaders.set('x-api-version', apiVersion);
  response.headers.set('X-API-Version', apiVersion);

  const sunsetHeader = getSunsetHeaderValue(apiVersion);
  if (sunsetHeader) {
    response.headers.set('Sunset', sunsetHeader);
  }

  const normalizedPathname = pathname.replace(/^\/api\/v\d+(?:\.\d+)?/, '/api');

  // 2.bis — P1 Rate limiting : protège toutes les routes /api (y compris
  // publiques comme /api/auth/login) contre l'abus / le brute-force.
  // Les clés API (x-api-key) ont un quota supérieur. En production,
  // injecter un client Redis via setRedisClient() pour un compteur distribué.
  const apiKeyRl = request.headers.get('x-api-key');
  const clientIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';
  const rlIdentity = apiKeyRl ? `apikey:${apiKeyRl}` : `ip:${clientIp}`;
  const rlResult = await rateLimit({
    key: rlIdentity,
    windowSec: RL_WINDOW_SEC,
    max: apiKeyRl ? RL_MAX_APIKEY : RL_MAX_ANON,
    bypass: false,
  });
  response.headers.set('X-RateLimit-Limit', String(apiKeyRl ? RL_MAX_APIKEY : RL_MAX_ANON));
  if (!rlResult.ok) {
    const retryAfterSec = rlResult.retryAfterSec;
    const rlRes = NextResponse.json(
      { error: 'Too Many Requests', retryAfterSec },
      { status: 429, headers: response.headers },
    );
    rlRes.headers.set('Retry-After', String(retryAfterSec));
    rlRes.headers.set('X-RateLimit-Remaining', '0');
    return rlRes;
  }

  // 3. Routes publiques (liste stricte)
  if (PUBLIC_PATHS.some((p) => matchesRoute(pathname, p) || matchesRoute(normalizedPathname, p))) {
    return response;
  }

  // 4. DENY-BY-DEFAULT : une auth est requise.
// @ts-ignore — type narrowing pending, see refactor ticket
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifyFirebaseSession(sessionCookie);

  const apiKey = request.headers.get('x-api-key');
  const hasBearer = request.headers.get('authorization')?.startsWith('Bearer ');
  // X-Cron-Secret : autorise les checks automatisés (cron jobs, monitoring,
  // /api/email/test) à appeler des routes /api/* sans session utilisateur.
  // Sécurisé par CRON_SECRET côté serveur — le client doit connaître la valeur.
  const cronSecret = process.env.CRON_SECRET;
  const cronHeader = request.headers.get('x-cron-secret');
  const hasValidCronSecret = !!(cronSecret && cronHeader && cronHeader === cronSecret);

  if (!session && !apiKey && !hasBearer && !hasValidCronSecret) {
    const unauthRes = NextResponse.json(
      { error: 'Authentification requise' },
      { status: 401, headers: response.headers }
    );
    unauthRes.headers.set('X-API-Version', apiVersion);
    return unauthRes;
  }

  // 5. Routes ADMIN : le rôle vient UNIQUEMENT du custom claim Firebase.
  if (ADMIN_ROUTES.some((p) => pathname.startsWith(p) || normalizedPathname.startsWith(p))) {
    if (!session || session.role !== 'admin') {
      const forbiddenRes = NextResponse.json(
        { error: 'Accès réservé aux administrateurs' },
        { status: 403, headers: response.headers }
      );
      forbiddenRes.headers.set('X-API-Version', apiVersion);
      return forbiddenRes;
    }
  }

  // 6. Sinon : on laisse passer pour la couche 2 (withAuth validera les api keys/bearer).
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|sw.js|manifest.json).*)'],
};
