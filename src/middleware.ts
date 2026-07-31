import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { checkRateLimit } from '@/lib/rate-limiter';

const PUBLIC_ROUTES = new Set(['/api/auth/','/api/health','/api/register','/api/password/','/api/webhook/','/api/terminal/events']);
const PROTECTED_ROUTES = [
  { prefix: '/api/admin/', role: 'admin' as const },
  { prefix: '/api/terminal/execute', role: 'admin' as const },
  { prefix: '/api/services/', role: 'admin' as const },
  { prefix: '/api/agents/', role: 'user' as const },
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
  for (const r of PUBLIC_ROUTES) if (pathname.startsWith(r)) return true;
  return false;
}

function getRequiredRole(pathname: string): string | null {
  for (const r of PROTECTED_ROUTES) if (pathname.startsWith(r.prefix)) return r.role;
  return null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!checkRateLimit(request)) return new NextResponse('Too Many Requests', { status: 429 });
  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
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
