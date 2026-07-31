import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

const PUBLIC_ROUTES = new Set([
  '/api/auth/', '/api/health', '/api/register', '/api/password/', '/api/webhook/', '/api/terminal/events',
]);

const PROTECTED_ROUTES = [
  { prefix: '/api/admin/', role: 'admin' as const },
  { prefix: '/api/terminal/execute', role: 'admin' as const },
  { prefix: '/api/services/', role: 'admin' as const },
  { prefix: '/api/agents/', role: 'user' as const },
  { prefix: '/api/whatsapp/', role: 'user' as const },
  { prefix: '/api/credits/', role: 'user' as const },
  { prefix: '/api/marketplace/', role: 'user' as const },
  { prefix: '/api/workflows/', role: 'user' as const },
  { prefix: '/api/plugins/', role: 'user' as const },
  { prefix: '/api/datasets/', role: 'user' as const },
  { prefix: '/api/notifications/', role: 'user' as const },
  { prefix: '/api/stripe/', role: 'user' as const },
  { prefix: '/api/sebpay/', role: 'user' as const },
];

function isPublicRoute(pathname: string): boolean {
  for (const route of PUBLIC_ROUTES) if (pathname.startsWith(route)) return true;
  return false;
}

function getRequiredRole(pathname: string): string | null {
  for (const route of PROTECTED_ROUTES) if (pathname.startsWith(route.prefix)) return route.role;
  return null;
}

function getRateLimitKey(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip') || '127.0.0.1';
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60000, MAX_R = 100, CLEANUP_INT = 300000;
let lastCleanup = Date.now();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const ws = Math.floor(now / WINDOW_MS) * WINDOW_MS;
  const key = `${ip}:${ws}`;
  const entry = rateLimitMap.get(key);
  if (entry) { entry.count++; if (entry.count > MAX_R) return false; }
  else rateLimitMap.set(key, { count: 1, resetAt: ws + WINDOW_MS });
  if (now - lastCleanup > CLEANUP_INT) {
    lastCleanup = now; const cut = now - WINDOW_MS * 2;
    for (const [k, v] of rateLimitMap) { if (v.resetAt < cut) rateLimitMap.delete(k); }
  }
  return true;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!checkRateLimit(getRateLimitKey(request))) return new NextResponse('Too Many Requests', { status: 429 });

  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname === '/icon.svg') return response;
  if (!pathname.startsWith('/api/')) return response;
  if (isPublicRoute(pathname)) return response;

  const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });
  if (!token) return NextResponse.json({ error: 'Authentification requise' }, { status: 401 });

  const requiredRole = getRequiredRole(pathname);
  if (requiredRole === 'admin' && token.role !== 'admin') {
    return NextResponse.json({ error: 'Acces reserve aux administrateurs' }, { status: 403 });
  }

  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'] };
