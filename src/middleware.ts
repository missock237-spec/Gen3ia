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
//  PHASE 2.1 — CSP durcie : whitelist explicite pour CDNs.
// ============================================================

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getAdminAuth } from '@/lib/firebase/admin';
import { SESSION_COOKIE_NAME } from '@/lib/firebase/config';

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

// ---------- Phase 2.1 : CSP durcie ----------
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

function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(route.endsWith('/') ? route : route + '/');
}

/**
 * Vérifie le session cookie Firebase sans crasher si Firebase Admin n'est
 * pas configuré (build phase). Retourne { uid, role } ou null.
 */
async function verifyFirebaseSession(cookieValue: string | undefined): Promise<{ uid: string; role: string } | null> {
  if (!cookieValue) return null;
  try {
    const auth = getAdminAuth();
    const decoded = await auth.verifySessionCookie(cookieValue, false); // checkRevoked=false dans le middleware (perf)
    const role = (decoded.role as string) || 'user';
    return { uid: decoded.uid, role };
  } catch {
    return null;
  }
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
