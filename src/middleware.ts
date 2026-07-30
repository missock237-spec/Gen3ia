import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60000, MAX_R = 100, CLEANUP_INT = 300000;
let lastCleanup = Date.now();
export function middleware(request: NextRequest) {
  const r = NextResponse.next();
  r.headers.set('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.openai.com https://api.anthropic.com https://api.groq.com https://openrouter.ai https://api-inference.huggingface.co https://api.twilio.com https://api.stripe.com wss:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '));
  r.headers.set('X-Content-Type-Options', 'nosniff');
  r.headers.set('X-Frame-Options', 'DENY');
  r.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  r.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '127.0.0.1';
  const now = Date.now();
  const ws = Math.floor(now / WINDOW_MS) * WINDOW_MS;
  const c = rateLimitMap.get(`${ip}:${ws}`);
  if (c) {
    c.count++;
    if (c.count > MAX_R) return new NextResponse('Too Many Requests', { status: 429, headers: { 'Retry-After': String(Math.ceil((c.resetAt - now) / 1000)) } });
  } else rateLimitMap.set(`${ip}:${ws}`, { count: 1, resetAt: ws + WINDOW_MS });
  if (now - lastCleanup > CLEANUP_INT) {
    lastCleanup = now;
    const cut = now - WINDOW_MS * 2;
    for (const [k, v] of rateLimitMap) { if (v.resetAt < cut) rateLimitMap.delete(k); }
  }
  return r;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'] };