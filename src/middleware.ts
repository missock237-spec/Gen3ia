// ============================================================
// MIDDLEWARE EDGE — RATE LIMITING, SÉCURITÉ, AUTH
// ============================================================
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ============================================================
// 1. RATE LIMITER INTÉGRÉ (SLIDING WINDOW MÉMOIRE)
// ============================================================
// Stratégies différenciées par endpoint
// Protection contre les attaques par force brute et déni de service
// ============================================================

type RateLimitStrategy = {
  windowMs: number;
  maxRequests: number;
};

const RATE_LIMIT_STRATEGIES: Record<string, RateLimitStrategy> = {
  strict:   { windowMs: 60_000,  maxRequests: 10 },
  moderate: { windowMs: 60_000,  maxRequests: 60 },
  relaxed:  { windowMs: 60_000,  maxRequests: 200 },
};

function getStrategy(pathname: string): RateLimitStrategy {
  if (pathname.startsWith("/api/auth/"))     return RATE_LIMIT_STRATEGIES.strict;
  if (pathname.startsWith("/api/agents"))    return RATE_LIMIT_STRATEGIES.moderate;
  if (pathname.startsWith("/api/workflows")) return RATE_LIMIT_STRATEGIES.moderate;
  if (pathname.startsWith("/api/webhooks"))  return RATE_LIMIT_STRATEGIES.relaxed;
  return RATE_LIMIT_STRATEGIES.moderate;
}

const rateLimitMap = new Map<string, number[]>();

function checkRateLimit(
  identifier: string,
  pathname: string,
): { allowed: boolean; remaining: number; resetIn: number } {
  const strategy = getStrategy(pathname);
  const key = `${identifier}:${pathname}`;
  const now = Date.now();

  let timestamps = rateLimitMap.get(key) ?? [];
  timestamps = timestamps.filter((t) => now - t < strategy.windowMs);

  if (timestamps.length >= strategy.maxRequests) {
    const oldest = timestamps[0] as number;
    const resetIn = Math.ceil((oldest + strategy.windowMs - now) / 1000);
    return { allowed: false, remaining: 0, resetIn: Math.max(1, resetIn) };
  }

  timestamps.push(now);
  rateLimitMap.set(key, timestamps);
  return {
    allowed: true,
    remaining: strategy.maxRequests - timestamps.length,
    resetIn: Math.ceil(strategy.windowMs / 1000),
  };
}

// ============================================================
// 2. HEADERS DE SÉCURITÉ
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

  if (EXCLUDED_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // ============================================================
  // RATE LIMITING — sur toutes les routes API
  // ============================================================
  if (pathname.startsWith("/api/")) {
    const identifier =
      request.headers.get("x-forwarded-for") ??
      request.headers.get("x-real-ip") ??
      "127.0.0.1";

    const { allowed, remaining, resetIn } = checkRateLimit(
      identifier,
      pathname,
    );

    if (!allowed) {
      return new NextResponse(
        JSON.stringify({
          error: "Too Many Requests",
          message: `Limite de ${getStrategy(pathname).maxRequests} requêtes par minute atteinte. Réessayez dans ${resetIn} seconde(s).`,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(resetIn),
            "X-RateLimit-Limit": String(getStrategy(pathname).maxRequests),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(
              Math.ceil(Date.now() / 1000) + resetIn,
            ),
            ...SECURITY_HEADERS,
          },
        },
      );
    }

    const response = NextResponse.next();
    response.headers.set(
      "X-RateLimit-Limit",
      String(getStrategy(pathname).maxRequests),
    );
    response.headers.set("X-RateLimit-Remaining", String(remaining));
    response.headers.set(
      "X-RateLimit-Reset",
      String(Math.ceil(Date.now() / 1000) + resetIn),
    );

    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      response.headers.set(key, value);
    }

    return response;
  }

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
