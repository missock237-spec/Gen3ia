// ============================================================
// Gen3ia — Middleware de sécurité (deny-by-default)
//
// Règle : TOUTE route /api/* est protegee SAUF celles
// explicitement listees comme publiques (route par route, pas par prefixe).
//
// SECURITE : ce middleware NE S'APPUIE QUE sur le token NextAuth (getToken)
// comme source de verite. Les headers x-api-key / authorization ne sont PAS
// suffisants pour passer (ils doivent etre valides par la couche 2 withAuth).
// Pas de court-circuit du controle de role admin.
// ============================================================

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Routes publiques LISTEES ROUTE PAR ROUTE (pas de prefixe large qui rendrait
// /api/auth/2fa/setup, /api/auth/password/modify, etc. accessibles).
const PUBLIC_PATHS = [
  '/api/auth/session',
  '/api/auth/csrf',
  '/api/auth/callback/google',
  '/api/auth/callback/github',
  '/api/auth/callback/credentials',
  '/api/auth/providers',
  '/api/auth/signin',
  '/api/auth/signout',
  '/api/health',
  '/api/health/features',
  '/api/register',
  '/api/webhook/stripe',
  '/api/webhook/sebpay',
  '/api/webhooks/stripe',
  '/api/webhooks/sebpay',
  '/api/events/sse',
  '/api/docs',
  '/api/docs/openapi.json',
];

// Routes necessitant un role ADMIN (1ere couche).
const ADMIN_ROUTES = [
  '/api/admin/',
  '/api/terminal/execute',
  '/api/services/',
  '/api/keys/',
  '/api/metrics/',
  '/api/monitoring/',
  '/api/system/',
];

// Routes sensibles qui consomment des ressources LLM / coutent de l'argent
// => exigent un token valide ET seront verifiees par withAuth (couche 2).
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

/**
 * Politique CSP. Note : 'unsafe-inline' est requis pour certains bundles Next 14,
 * mais 'unsafe-eval' est retire en production (voir commentaire ci-dessous).
 * Pour une securite maximal, migrer vers les nonces Next.
 */
const CSP_HEADER = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.githubusercontent.com https://*.googleusercontent.com https://cdn.huggingface.co",
  "font-src 'self' data:",
  "connect-src 'self' https://api.openai.com https://api.anthropic.com https://api.groq.com https://openrouter.ai https://api-inference.huggingface.co https://*.sentry.io",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

// Verifie si le pathname correspond exactement ou est un prefixe de route (sous-chemin)
function matchesRoute(pathname: string, route: string): boolean {
  // Exact match ou prefixe avec '/' (sous-chemin), mais pas 'profile' qui matche 'profilex'
  return pathname === route || pathname.startsWith(route.endsWith('/') ? route : route + '/');
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // En-tetes de securite
  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-DNS-Prefetch-Control', 'off');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('Content-Security-Policy', CSP_HEADER);
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }

  // 1. Fichiers statiques
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon') ||
      pathname === '/icon.svg' || pathname === '/sw.js' || pathname === '/manifest.json') {
    return response;
  }

  // 2. Routes non-API : pas de controle d'auth au niveau middleware
  if (!pathname.startsWith('/api/')) {
    return response;
  }

  // 3. Routes publiques (liste stricte, route par route)
  if (PUBLIC_PATHS.some((p) => matchesRoute(pathname, p))) {
    return response;
  }

  // 4. DENY-BY-DEFAULT — SEUL le token NextAuth fait foi (source de verite unique).
  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });

  // Un token NextAuth valide est REQUIS pour passer la couche 1.
  // Les API keys / Bearer ne suffisent PAS ici : elles SONT VERIFIEES dans la couche 2 (withAuth).
  if (!token) {
    return NextResponse.json({ error: 'Authentification requise' }, { status: 401 });
  }

  // 5. Routes admin — CONTROLE DE ROLE OBLIGATOIRE, jamais court-circuite.
  if (ADMIN_ROUTES.some((p) => pathname.startsWith(p))) {
    // Le role vient UNIQUEMENT du token NextAuth. Refuser si role != admin.
    if (token.role !== 'admin') {
      return NextResponse.json({ error: 'Acces reserve aux administrateurs' }, { status: 403 });
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|sw.js|manifest.json).*)'],
};
