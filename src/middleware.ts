import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Rate limiting basé sur IP (in-memory, à remplacer par Redis en prod)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 100; // 100 requêtes par minute

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Headers de sécurité
  const cspHeader = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https://*.vercel.app https://*.githubusercontent.com https://*.googleusercontent.com https://res.cloudinary.com https://images.unsplash.com",
    "font-src 'self'",
    "connect-src 'self' https://*.vercel.app",
    "frame-ancestors 'none'",
    "base-uri 'self'",
  ].join('; ');

  response.headers.set('Content-Security-Policy', cspHeader);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // Rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || '127.0.0.1';

  const now = Date.now();
  const windowStart = Math.floor(now / WINDOW_MS) * WINDOW_MS;
  const key = `${ip}:${windowStart}`;

  const current = rateLimitMap.get(key);
  if (current) {
    current.count++;
    if (current.count > MAX_REQUESTS) {
      return new NextResponse('Too Many Requests', {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((current.resetAt - now) / 1000)),
        },
      });
    }
  } else {
    rateLimitMap.set(key, { count: 1, resetAt: windowStart + WINDOW_MS });
  }

  // Cleanup vieux buckets
  if (rateLimitMap.size > 10000) {
    const cutoff = now - WINDOW_MS * 2;
    for (const [k, v] of rateLimitMap) {
      if (v.resetAt < cutoff) rateLimitMap.delete(k);
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
