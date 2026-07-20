// ============================================================
// MIDDLEWARE EDGE — Rate Limiting, Sécurité, Logger
// ============================================================
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimiter } from "@/lib/rate-limiter";
import { logger } from "@/lib/logger";

// ============================================================
// HEADERS DE SÉCURITÉ
// ============================================================
const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.stripe.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.co; connect-src 'self' https://*.stripe.com https://*.supabase.co; frame-src 'self' https://*.stripe.com",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

const EXCLUDED_PATHS = ["/_next", "/static", "/favicon.ico"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const startTime = Date.now();
  const requestId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  if (EXCLUDED_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // ============================================================
  // RATE LIMITING — via le module centralisé (Upstash Redis + fallback mémoire)
  // ============================================================
  if (pathname.startsWith("/api/")) {
    const identifier = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "127.0.0.1";

    const { allowed, remaining, resetIn } = await rateLimiter.check(identifier, pathname);

    if (!allowed) {
      logger.warn("rate_limit_blocked", { pathname, identifier, requestId });
      return new NextResponse(
        JSON.stringify({
          error: "Too Many Requests",
          message: "Trop de requêtes. Réessayez plus tard.",
          retryAfter: resetIn,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(resetIn),
            "X-RateLimit-Remaining": "0",
            ...SECURITY_HEADERS,
          },
        },
      );
    }

    const response = NextResponse.next();
    response.headers.set("X-RateLimit-Remaining", String(remaining));
    response.headers.set("X-RateLimit-Reset", String(Math.ceil(Date.now() / 1000) + resetIn));

    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      response.headers.set(key, value);
    }

    logger.info("request", { pathname, method: request.method, requestId, durationMs: Date.now() - startTime });
    return response;
  }

  // Routes non-API : headers de sécurité uniquement
  const response = NextResponse.next();
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};