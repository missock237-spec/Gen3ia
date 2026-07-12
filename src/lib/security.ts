import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/session';
import { hasRole, UserRole } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';

export function applyCorsHeaders(
  response: NextResponse,
  origin?: string
): void {
  const allowedOrigins = getAllowedOrigins(origin);
  if (allowedOrigins) {
    response.headers.set('Access-Control-Allow-Origin', allowedOrigins);
  }
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Access-Control-Max-Age', '86400');
}

const ALLOWED_ORIGINS: string[] = [
  // Production origins
  ...(process.env.CORS_ALLOWED_ORIGINS?.split(',').filter(Boolean) || []),
  // Development origins
  ...(process.env.NODE_ENV === 'development' ? ['http://localhost:3000'] : []),
];

export function getAllowedOrigins(origin?: string): string | null {
  if (!origin) return null;
  // Strict origin validation: only allow explicitly whitelisted origins
  if (ALLOWED_ORIGINS.includes(origin)) {
    return origin;
  }
  // Same-origin requests (origin matches the server's own host)
  const serverHost = process.env.NEXT_PUBLIC_APP_URL || '';
  if (serverHost && origin === serverHost) {
    return origin;
  }
  // Deny all other origins
  return null;
}

interface SecurityOptions {
  requireAuth?: boolean;
  requireRole?: UserRole;
  rateLimit?: {
    limit: number;
    windowMs: number;
  };
}

interface SecurityResult {
  auth: { userId: string; role?: string } | null;
  error: NextResponse | null;
}

export async function applySecurity(
  request: NextRequest,
  options: SecurityOptions = {}
): Promise<SecurityResult> {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 204 });
    applyCorsHeaders(response, request.headers.get('origin') || undefined);
    return { auth: null, error: response };
  }

  // Rate limiting — Redis-backed via rateLimit(), safe for serverless/multi-instance
  if (options.rateLimit) {
    const identifier =
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      'unknown';

    const result = await rateLimit(`security:${identifier}`, {
      max: options.rateLimit.limit,
      windowMs: options.rateLimit.windowMs,
    });

    if (!result.success) {
      const response = NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
      response.headers.set('Retry-After', String(Math.ceil((result.resetAt - Date.now()) / 1000)));
      applyCorsHeaders(response, request.headers.get('origin') || undefined);
      return { auth: null, error: response };
    }
  }

  // Auth check
  if (options.requireAuth) {
    const auth = await getAuthenticatedUser(request);
    if (!auth) {
      const response = NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
      applyCorsHeaders(response, request.headers.get('origin') || undefined);
      return { auth: null, error: response };
    }

    // RBAC: Check role if required
    if (options.requireRole) {
      const userRole = auth.role || 'user';
      if (!hasRole(userRole, options.requireRole)) {
        const response = NextResponse.json(
          { error: 'Insufficient permissions' },
          { status: 403 }
        );
        applyCorsHeaders(response, request.headers.get('origin') || undefined);
        return { auth, error: response };
      }
    }

    return { auth, error: null };
  }

  return { auth: null, error: null };
}

export function secureResponse(
  response: NextResponse,
  request: NextRequest
): NextResponse {
  applyCorsHeaders(response, request.headers.get('origin') || undefined);
  return response;
}

/**
 * Verify that the authenticated user owns the resource.
 * Returns a 403 NextResponse if ownership check fails, or null if OK.
 */
export function verifyOwnership(
  authUserId: string,
  resourceUserId: string,
  resourceName: string = 'Resource'
): NextResponse | null {
  if (authUserId !== resourceUserId) {
    return NextResponse.json(
      { error: `You do not have permission to access this ${resourceName}` },
      { status: 403 }
    );
  }
  return null;
}
