import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// ============================================================
// Routes publiques (aucune auth requise)
// ============================================================
const PUBLIC_ROUTES = new Set([
  '/api/auth/',           // NextAuth (login, callback, session)
  '/api/health',          // Health check
  '/api/register',        // Inscription
  '/api/password/',       // Reset password
  '/api/webhook/',        // Webhooks (Stripe, etc. - verifie signature)
  '/api/terminal/events', // SSE events (authentifie via token dans l'URL)
]);

// ============================================================
// Routes à protéger (auth requise)
// ============================================================
const PROTECTED_ROUTES = [
  { prefix: '/api/admin/',        role: 'admin' },
  { prefix: '/api/terminal/execute', role: 'admin' },
  { prefix: '/api/agents/run',    role: 'user' },
  { prefix: '/api/agents/swarm',  role: 'user' },
  { prefix: '/api/agents/',       role: 'user' },
  { prefix: '/api/services/',     role: 'admin' },
  { prefix: '/api/whatsapp/send', role: 'user' },
  { prefix: '/api/whatsapp/call', role: 'user' },
  { prefix: '/api/stripe/',       role: 'user' },
  { prefix: '/api/sebpay/',       role: 'user' },
  { prefix: '/api/credits/',      role: 'user' },
  { prefix: '/api/marketplace/',  role: 'user' },
  { prefix: '/api/workflows/',    role: 'user' },
  { prefix: '/api/plugins/',      role: 'user' },
  { prefix: '/api/datasets/',     role: 'user' },
  { prefix: '/api/notifications/', role: 'user' },
];

function isPublicRoute(pathname: string): boolean {
  for (const route of PUBLIC_ROUTES) {
    if (pathname.startsWith(route)) return true;
  }
  return false;
}

function getRequiredRole(pathname: string): string | null {
  for (const route of PROTECTED_ROUTES) {
    if (pathname.startsWith(route.prefix)) return route.role;
  }
  return null;
}

function getRateLimitKey(request: NextRequest): string {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || '127.0.0.1';
  return ip;
}

// Rate limiting simple (en memoire)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60000;
const MAX_R = 100;
const CLEANUP_INT = 300000;
let lastCleanup = Date.now();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const ws = Math.floor(now / WINDOW_MS) * WINDOW_MS;
  const key = `${ip}:${ws}`;
  const entry = rateLimitMap.get(key);
  if (entry) {
    entry.count++;
    if (entry.count > MAX_R) return false;
  } else {
    rateLimitMap.set(key, { count: 1, resetAt: ws + WINDOW_MS });
  }
  if (now - lastCleanup > CLEANUP_INT) {
    lastCleanup = now;
    const cut = now - WINDOW_MS * 2;
    for (const [k, v] of rateLimitMap) {
      if (v.resetAt < cut) rateLimitMap.delete(k);
    }
  }
  return true;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Rate limiting
  if (!checkRateLimit(getRateLimitKey(request))) {
    return new NextResponse('Too Many Requests', { status: 429 });
  }

  // 2. Headers de securite
  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // 3. Ne pas bloquer les ressources statiques
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname === '/icon.svg') {
    return response;
  }

  // 4. Routes API uniquement
  if (!pathname.startsWith('/api/')) {
    return response;
  }

  // 5. Routes publiques
  if (isPublicRoute(pathname)) {
    return response;
  }

  // 6. Verifier le role requis
  const requiredRole = getRequiredRole(pathname);
  if (!requiredRole) {
    // Route sans protection explicite -> auth minimale requise
    const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });
    if (!token) {
      return NextResponse.json({ error: 'Authentification requise' }, { status: 401 });
    }
    return response;
  }

  // 7. Verifier le token et le role
  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: 'Authentification requise' }, { status: 401 });
  }

  const userRole = (token as any).role || 'user';
  if (requiredRole === 'admin' && userRole !== 'admin') {
    return NextResponse.json({ error: 'Acces reserve aux administrateurs' }, { status: 403 });
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg).*)',
  ],
};
