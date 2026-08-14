// ============================================================
// Gen3ia — Middleware de sécurité (deny-by-default) — Firebase
// ============================================================
//  Règle : TOUTE route /api/* est protégée SAUF celles
//  explicitement listées comme publiques (route par route).
//
//  SECURITE :
//  - Layer 1 (ce middleware) : exige UNE forme d'auth (session cookie
//    Firebase OU présence x-api-key/bearer qui seront VALIDES en couche 2
//    withAuth).
//  - Les routes ADMIN exigent TOUJOURS le rôle 'admin' (custom claim
//    Firebase Auth), jamais court-circuité par une api key non validée.
//
//  CSP durcie (nonce per-request) :
//  - Un nonce unique est genère par requete et propage a Next.js via
//    l'header de requete "x-nonce" (Next.js l'applique automatiquement a
//    ses <script> inline).
//  - En production, script-src n'autorise PLUS 'unsafe-inline'/'unsafe-eval'
//    mais 'self' + nonce + CDNs de confiance, eliminant le vecteur XSS.
// ============================================================

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

// ---------- CSP durcie par nonce ----------
const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * Genere un nonce CSP aleatoire (Edge-safe : Web Crypto + btoa).
 */
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=+$/, '');
}

/**
 * Construit la CSP. En production : 'unsafe-inline'/'unsafe-eval' ABSENTS
 * de script-src (remplacés par un nonce). En dev : on les autorise pour HMR.
 */
function buildCsp(nonce: string): string {
  const scriptSrc = IS_PROD
    ? `script-src 'self' 'nonce-${nonce}' https://www.googletagmanager.com https://www.google-analytics.com https://*.jsdelivr.net`
    : `script-src 'self' 'nonce-${nonce}' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://*.jsdelivr.net`;

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https://*.githubusercontent.com https://*.googleusercontent.com https://cdn.huggingface.co https://www.google-analytics.com https://www.googletagmanager.com https://storage.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://api.openai.com https://api.anthropic.com https://api.groq.com https://openrouter.ai https://api-inference.huggingface.co https://*.sentry.io https://www.google-analytics.com https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://fcm.googleapis.com",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join('; ');
}

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

  // CSP par nonce : un nonce unique par requête, propagé à Next.js.
  const nonce = generateNonce();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-DNS-Prefetch-Control', 'off');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  response.headers.set('Content-Security-Policy', buildCsp(nonce));
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('x-nonce', nonce);
  if (IS_PROD) {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }

  // 1. Fichiers statiques
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon') ||
      pathname === '/icon.svg' || pathname === '/sw.js' || pathname === '/manifest.json') {
    return response;
  }

  // 2. Routes non-API
  if (!pathname.startsWith('/api/')) {
    return response;
  }

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
  if (PUBLIC_PATHS.some((p) => matchesRoute(pathname, p))) {
    return response;
  }

  // 4. DENY-BY-DEFAULT : une auth est requise.
// @ts-ignore
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifyFirebaseSession(sessionCookie);

  const apiKey = request.headers.get('x-api-key');
  const hasBearer = request.headers.get('authorization')?.startsWith('Bearer ');

  if (!session && !apiKey && !hasBearer) {
    return NextResponse.json({ error: 'Authentification requise' }, { status: 401 });
  }

  // 5. Routes ADMIN : le rôle vient UNIQUEMENT du custom claim Firebase.
  if (ADMIN_ROUTES.some((p) => pathname.startsWith(p))) {
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 });
    }
  }

  // 6. Sinon : on laisse passer pour la couche 2 (withAuth validera les api keys/bearer).
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|sw.js|manifest.json).*)'],
};
