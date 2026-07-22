import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { checkRateLimit } from '@/middleware/rate-limit';
import crypto from 'crypto';

const SESSION_COOKIE = 'genova_session';
const PUBLIC_ROUTES = [
  '/api/auth/login', '/api/auth/register', '/api/auth/forgot-password',
  '/api/auth/reset-password', '/api/auth/verify-email',
  '/api', '/api/status', '/api/docs', '/api/health',
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(route => pathname === route || pathname === route + '/');
}

function addSecurityHeaders(response: NextResponse, nonce: string): void {
  response.headers.set(
    'Content-Security-Policy',
    `default-src 'self'; ` +
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'; ` +
    `style-src 'self' 'nonce-${nonce}'; ` +
    `img-src 'self' data: blob: https:; ` +
    `font-src 'self' data:; ` +
    `connect-src 'self' https: wss:; ` +
    `frame-ancestors 'none'; ` +
    `base-uri 'self'; ` +
    `form-action 'self'`
  );
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)'
  );
}

function getCorsOrigin(origin: string | null): string | null {
  if (!origin) return null;
  const allowed = [
    ...(process.env.CORS_ALLOWED_ORIGINS?.split(',').filter(Boolean) || []),
    ...(env.isDev() ? ['http://localhost:3000'] : []),
  ];
  if (allowed.includes(origin)) return origin;
  return null;
}

function getClientIp(request: NextRequest): string {
  if (request.ip) return request.ip;
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const ua = request.headers.get('user-agent') || 'unknown';
  const accept = request.headers.get('accept') || 'unknown';
  return crypto.createHash('sha256').update(ua + accept).digest('hex').substring(0, 16);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const origin = request.headers.get('origin');
  const nonce = crypto.randomBytes(16).toString('base64');

  const clientIp = getClientIp(request);
  const rateCheck = checkRateLimit(clientIp, pathname);
  if (!rateCheck.ok) {
    return new NextResponse(
      JSON.stringify({ error: 'Too Many Requests', retryAfter: Math.ceil(rateCheck.resetIn / 1000) }),
      { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil(rateCheck.resetIn / 1000)) } }
    );
  }

  if (request.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 204 });
    const allowedOrigin = getCorsOrigin(origin);
    if (allowedOrigin) response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Idempotency-Key');
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Max-Age', '86400');
    addSecurityHeaders(response, nonce);
    return response;
  }

  if (isPublicRoute(pathname)) {
    const response = NextResponse.next();
    addSecurityHeaders(response, nonce);
    return response;
  }

  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionToken && !pathname.startsWith('/_next') && !pathname.startsWith('/static')) {
    const response = NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const allowedOrigin = getCorsOrigin(origin);
    if (allowedOrigin) response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
    addSecurityHeaders(response, nonce);
    return response;
  }

  const response = NextResponse.next();
  addSecurityHeaders(response, nonce);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
};
