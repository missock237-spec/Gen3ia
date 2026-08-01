// ============================================================
// Gen3ia — Middleware de sécurité (deny-by-default)
// 
// Règle : TOUTE route /api/* est protégée SAUF celles
// explicitement listées comme publiques.
// C'est une 1ère couche de défense. Chaque handler doit AUSSI
// utiliser withAuth() en 2ème couche (voir src/lib/with-auth.ts).
//
// En-têtes de sécurité : CSP + HSTS ajoutés.
// ============================================================

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Routes réellement publiques (auth pas requise au niveau middleware)
const PUBLIC_PATHS = [
  '/api/auth/',
  '/api/auth/session',
  '/api/auth/csrf',
  '/api/auth/callback',
  '/api/auth/providers',
  '/api/auth/signin',
  '/api/auth/signout',
  '/api/health',
  '/api/health/',
  '/api/register',
  '/api/register/',
  '/api/password/',
  '/api/webhook/',
  '/api/webhook/stripe',
  '/api/webhook/sebpay',
  '/api/webhooks/',
  '/api/webhooks/stripe',
  '/api/terminal/events',
  '/api/events/sse',
  '/api/docs',
  '/api/docs/',
];

// Routes nécessitant un rôle admin (1ère couche)
const ADMIN_ROUTES = [
  '/api/admin/',
  '/api/terminal/execute',
  '/api/services/',
  '/api/keys/',
  '/api/metrics/',
  '/api/monitoring/',
  '/api/system/',
];

// Routes sensibles qui consomment des ressources LLM / coûtent de l'argent
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
 * Politique CSP stricte pour l'app Gen3ia.
 * - default-src 'self'
 * - scripts : self + 'unsafe-inline' (Next nécessite parfois inline pour le bootstrap)
 * - styles : 'unsafe-inline' requis par Next/Radix
 * - images : self + data + blob + domaines autorisés (githubusercontent, googleusercontent, huggingface)
 * - connexions : self + API externes (openai, anthropic, groq, openrouter, huggingface)
 */
const CSP_HEADER = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next dev + certain bundles
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.githubusercontent.com https://*.googleusercontent.com https://cdn.huggingface.co",
  "font-src 'self' data:",
  "connect-src 'self' https://api.openai.com https://api.anthropic.com https://api.groq.com https://openrouter.ai https://api-inference.huggingface.co https://*.sentry.io",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // En-têtes de sécurité sur toutes les réponses
  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-DNS-Prefetch-Control', 'off');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // CSP stricte (ajout)
  response.headers.set('Content-Security-Policy', CSP_HEADER);
  // HSTS — uniquement en production HTTPS (ajout)
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

  // 3. Routes publiques
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p.endsWith('/') ? p : p + '/'))) {
    return response;
  }

  // 4. DENY-BY-DEFAULT
  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });
  const apiKey = request.headers.get('x-api-key');
  const hasBearer = request.headers.get('authorization')?.startsWith('Bearer ');
  if (!token && !apiKey && !hasBearer) {
    return NextResponse.json({ error: 'Authentification requise' }, { status: 401 });
  }

  // 5. Routes admin
  if (ADMIN_ROUTES.some((p) => pathname.startsWith(p))) {
    if (apiKey || hasBearer) return response;
    if (token && token.role !== 'admin') {
      return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 });
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|sw.js|manifest.json).*)'],
};
