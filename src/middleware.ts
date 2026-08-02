// ============================================================
// Gen3ia — Middleware de sécurité (deny-by-default)
//
// Règle : TOUTE route /api/* est protégée SAUF celles
// explicitement listées comme publiques (route par route).
//
// SECURITE :
// - Layer 1 (ce middleware) : exige UNE forme d'auth (token NextAuth OU
//   présence x-api-key/bearer qui seront VALIDES en couche 2 withAuth).
// - Les routes ADMIN exigent TOUJOURS le rôle 'admin' du token NextAuth
//   (jamais court-circuité par une api key non validée).
//
// PHASE 2.1 — CSP durcie :
//   - Whitelist explicite pour CDNs (fonts, analytics)
//   - Blocage des inline scripts/styles activable via NEXT_PUBLIC_STRICT_CSP=true
//     (par défaut désactivé pour ne pas casser les chunks inline de Next en dev)
// ============================================================

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Routes publiques LISTÉES ROUTE PAR ROUTE.
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

// Routes ADMIN : exigent TOUJOURS le rôle 'admin' du token NextAuth.
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

// ---------- Phase 2.1 : CSP durcie ----------
// NEXT_PUBLIC_STRICT_CSP=true => bloque les inline scripts/styles (XSS maximale).
// Par défaut (false) on autorise les inline (compatibilité chunks Next en dev).
const STRICT_CSP = process.env.NEXT_PUBLIC_STRICT_CSP === 'true';

const SCRIPT_SRC = STRICT_CSP
  ? "script-src 'self' https://www.googletagmanager.com https://www.google-analytics.com https://*.jsdelivr.net"
  : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://*.jsdelivr.net";

const STYLE_SRC = STRICT_CSP
  ? "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com"
  : "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com";

const CSP_HEADER = [
  "default-src 'self'",
  SCRIPT_SRC,
  STYLE_SRC,
  // Whitelist explicite des images (avatars + CDNs analytics)
  "img-src 'self' data: blob: https://*.githubusercontent.com https://*.googleusercontent.com https://cdn.huggingface.co https://www.google-analytics.com https://www.googletagmanager.com",
  // Fonts explicites
  "font-src 'self' data: https://fonts.gstatic.com",
  // connect-src : providers IA + Sentry + API internes
  "connect-src 'self' https://api.openai.com https://api.anthropic.com https://api.groq.com https://openrouter.ai https://api-inference.huggingface.co https://*.sentry.io https://www.google-analytics.com",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join('; ');

function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(route.endsWith('/') ? route : route + '/');
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-DNS-Prefetch-Control', 'off');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  response.headers.set('Content-Security-Policy', CSP_HEADER);
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  if (process.env.NODE_ENV === 'production') {
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

  // 3. Routes publiques (liste stricte)
  if (PUBLIC_PATHS.some((p) => matchesRoute(pathname, p))) {
    return response;
  }

  // 4. DENY-BY-DEFAULT : une auth est requise.
  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });
  const apiKey = request.headers.get('x-api-key');
  const hasBearer = request.headers.get('authorization')?.startsWith('Bearer ');

  if (!token && !apiKey && !hasBearer) {
    return NextResponse.json({ error: 'Authentification requise' }, { status: 401 });
  }

  // 5. Routes ADMIN : le rôle vient UNIQUEMENT du token NextAuth.
  //    Une api key ou bearer SEULE ne permet JAMAIS d'accéder aux routes admin.
  if (ADMIN_ROUTES.some((p) => pathname.startsWith(p))) {
    // Il faut un token NextAuth avec rôle admin.
    if (!token || token.role !== 'admin') {
      return NextResponse.json({ error: 'Acces reserve aux administrateurs' }, { status: 403 });
    }
  }

  // 6. Sinon : on laisse passer pour la couche 2 (withAuth validera les api keys/bearer).
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|sw.js|manifest.json).*)'],
};
