// ============================================================
// Gen3ia — Middleware de sécurité (deny-by-default)
// 
// Règle : TOUTE route /api/* est protégée SAUF celles
// explicitement listées comme publiques.
// C'est une 1ère couche de défense. Chaque handler doit AUSSI
// utiliser withAuth() en 2ème couche (voir src/lib/with-auth.ts).
// ============================================================

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Routes réellement publiques (auth pas requise au niveau middleware)
// NB : /api/webhook/* doit vérifier la signature HMAC en interne !
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
// => un simple token valide (même plan free) doit être vérifié (2ème couche withAuth)
const SENSITIVE_RESOURCE_ROUTES = [
  '/api/ai-server/',   // analyze, diagnose, process
  '/api/ai/',
  '/api/audio/',       // /generate etc.
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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // En-têtes de sécurité sur toutes les réponses
  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-DNS-Prefetch-Control', 'off');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // 1. Ne pas intercepter les fichiers statiques
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon') ||
      pathname === '/icon.svg' || pathname === '/sw.js' || pathname === '/manifest.json') {
    return response;
  }

  // 2. Les routes non-API : on vérifie juste auth pour le dashboard etc.
  if (!pathname.startsWith('/api/')) {
    return response;
  }

  // 3. Routes publiques : on laisse passer (le handler doit faire ses propres contrôles)
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p.endsWith('/') ? p : p + '/'))) {
    return response;
  }

  // 4. DENY-BY-DEFAULT : toute route /api/* non-publique exige un token valide
  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });

  // Cas spécial : les requests avec API Key sont gérées par withAuth() en 2ème couche,
  // mais au niveau middleware, on doit laisser passer pour que le handler vérifie.
  const apiKey = request.headers.get('x-api-key');
  const hasBearer = request.headers.get('authorization')?.startsWith('Bearer ');
  if (!token && !apiKey && !hasBearer) {
    return NextResponse.json({ error: 'Authentification requise' }, { status: 401 });
  }

  // 5. Vérifier le rôle admin pour les routes admin
  if (ADMIN_ROUTES.some((p) => pathname.startsWith(p))) {
    // Si API key ou Bearer, on laisse withAuth() décider (2ème couche)
    if (apiKey || hasBearer) return response;
    if (token && token.role !== 'admin') {
      return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 });
    }
  }

  // 6. Les routes sensibles (LLM coûteux) passent au withAuth() en 2ème couche
  //    qui vérifie le quota + le plan.
  if (SENSITIVE_RESOURCE_ROUTES.some((p) => pathname.startsWith(p))) {
    // on transmet, withAuth() gère le quota/plan
    return response;
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|sw.js|manifest.json).*)'],
};
