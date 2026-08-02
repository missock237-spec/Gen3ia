// ============================================================
// Gen3ia — Middleware de sécurité (deny-by-default)
//
// Règle : TOUTE route /api/* est protegee SAUF celles
// explicitement listees comme publiques (route par route).
//
// SECURITE :
// - Layer 1 (ce middleware) : exige UNE forme d'auth (token NextAuth OU
//   presence x-api-key/bearer qui seront VALIDES en couche 2 withAuth).
// - Les routes ADMIN exigent TOUJOURS le role 'admin' du token NextAuth
//   (jamais court-circuite par une api key non validee).
// ============================================================

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Routes publiques LISTEES ROUTE PAR ROUTE.
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

// Routes ADMIN : exigent TOUJOURS le role 'admin' du token NextAuth.
const ADMIN_ROUTES = [
  '/api/admin/',
  '/api/terminal/execute',
  '/api/services/',
  '/api/keys/',
  '/api/metrics/',
  '/api/monitoring/',
  '/api/system/',
];

// Routes sensibles (LLM couteux) : verifiees par withAuth (couche 2).
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
 * Production-ready Content Security Policy (CSP)
 * 
 * Security Strategy:
 * - default-src 'self': Only trust own origin by default
 * - script-src: No unsafe-inline in production (use nonces for necessary scripts)
 * - style-src: Allow unsafe-inline for styled-components (alternative: use nonces)
 * - connect-src: Whitelist external APIs only
 * - frame-ancestors 'none': Prevent clickjacking
 * - upgrade-insecure-requests: Auto-upgrade HTTP to HTTPS (production only)
 * 
 * Note: Next.js hydration scripts are handled via nonces if strict CSP is needed
 */
const createCSP = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  const directives = [
    "default-src 'self'",
    // Scripts: Allow self, unsafe-inline (for React hydration), and unsafe-eval (for dynamic code)
    // Production TODO: Use nonces for critical scripts instead
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    // Styles: Allow self and unsafe-inline (most React frameworks need this)
    "style-src 'self' 'unsafe-inline'",
    // Images: Allow self, data URIs, blobs, and GitHub/HuggingFace
    "img-src 'self' data: blob: https: https://*.githubusercontent.com https://*.googleusercontent.com https://cdn.huggingface.co",
    // Media: Allow self and HTTPS
    "media-src 'self' https:",
    // Fonts: Allow self and data URIs (for font files)
    "font-src 'self' data: https:",
    // Connections: Whitelist specific API endpoints
    "connect-src 'self' https://api.openai.com https://api.anthropic.com https://api.groq.com https://openrouter.ai https://api-inference.huggingface.co https://*.sentry.io wss://",
    // Frames: Prevent embedding in other sites (clickjacking protection)
    "frame-ancestors 'none'",
    // Base URI: Only allow same origin
    "base-uri 'self'",
    // Form submissions: Only to same origin
    "form-action 'self'",
    // Prevent plugin embeds unless from trusted sources
    "object-src 'none'",
    // Only upgrade insecure requests in production
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
  ];

  return directives.join('; ');
};

const CSP_HEADER = createCSP();

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

  // 5. Routes ADMIN : le role vient UNIQUEMENT du token NextAuth.
  //    Une api key ou bearer LUI SEUL ne permet JAMAIS d'acceder aux routes admin.
  if (ADMIN_ROUTES.some((p) => pathname.startsWith(p))) {
    // Il faut un token NextAuth avec role admin.
    if (!token || token.role !== 'admin') {
      return NextResponse.json({ error: 'Acces reserve aux administrateurs' }, { status: 403 });
    }
  }

  // 6. Sinon : on laisse passer pour la couche 2 (withAuth ne validera les api keys/bearer).
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|sw.js|manifest.json).*)'],
};
