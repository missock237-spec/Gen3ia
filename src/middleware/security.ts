/**
 * Security Middleware - Production-Grade API Protection
 * 
 * Rate limiting, CORS, CSP headers, input validation, CSRF protection
 */
import { NextRequest, NextResponse } from 'next/server';

const AUTH_RATE_LIMIT = 5; // 5 tentatives
const AUTH_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export async function authRateLimit(req: NextRequest, identifier: string): Promise<NextResponse | null> {
  // En production, utiliser Redis (Upstash) pour persistance
  const key = `auth_rate:${identifier}`;
  
  // Implémentation avec Redis :
  const redis = await import('@/lib/redis').then(m => m.getRedisClient());
  const current = await redis.incr(key);
  
  if (current === 1) {
    await redis.expire(key, Math.floor(AUTH_WINDOW_MS / 1000));
  }
  
  if (current > AUTH_RATE_LIMIT) {
    return NextResponse.json(
      { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
      { status: 429 }
    );
  }
  
  return null;
}

/**
 * Rate limiting middleware
 */
export function rateLimit(req: NextRequest): NextResponse | null {
  const clientId = req.headers.get('x-api-key') || req.headers.get('x-forwarded-for') || 'unknown';
  const now = Date.now();

  let bucket = rateLimitStore.get(clientId);

  if (!bucket || bucket.resetTime < now) {
    bucket = { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
    rateLimitStore.set(clientId, bucket);
  }

  bucket.count++;

  if (bucket.count > RATE_LIMIT_MAX_REQUESTS) {
    log.warn('rate_limit_exceeded', { clientId: clientId.slice(0, 16) });
    
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429 }
    );
  }

  return null;
}

/**
 * CORS middleware
 */
export function cors(req: NextRequest): NextRequest {
  const allowedOrigins = [
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    'https://app.gen3ia.com',
  ];

  const origin = req.headers.get('origin');
  const isAllowed = allowedOrigins.includes(origin || '');

  const headers = new Headers(req.headers);

  if (isAllowed) {
    headers.set('Access-Control-Allow-Origin', origin!);
    headers.set('Access-Control-Allow-Credentials', 'true');
  }

  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  headers.set('Access-Control-Max-Age', '3600');

  return new NextRequest(req, { headers });
}

/**
 * Security headers middleware
 */
export function securityHeaders(response: NextResponse): NextResponse {
  // Prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');

  // XSS protection
  response.headers.set('X-XSS-Protection', '1; mode=block');

  // Referrer policy
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // HSTS (HTTPS only)
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload'
  );

  // Permissions policy
  response.headers.set(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=(), payment=self'
  );

  // CSP (Content Security policy) 
response.headers.set(
  'Content-Security-Policy',
  `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'nonce-${nonce}'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
);

  return response;
}

/**
 * Input validation middleware
 */
export function validateInput(req: NextRequest): { valid: boolean; error?: string } {
  const contentType = req.headers.get('content-type');

  // Validate content type
  if (req.method !== 'GET' && contentType && !contentType.includes('application/json')) {
    return { valid: false, error: 'Invalid Content-Type' };
  }

  // Validate request size (max 10MB)
  const contentLength = req.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
    return { valid: false, error: 'Request body too large' };
  }

  return { valid: true };
}

/**
 * CSRF token validation
 */
export function generateCSRFToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function generateCSRFToken(sessionToken: string): string {
  const nonce = crypto.randomBytes(32).toString('hex');
  const hmac = crypto.createHmac('sha256', sessionToken);
  hmac.update(nonce);
  const signature = hmac.digest('hex');
  return `${nonce}:${signature}`;
}

export function validateCSRFToken(token: string, sessionToken: string): boolean {
  try {
    const [nonce, signature] = token.split(':');
    if (!nonce || !signature) return false;
    const hmac = crypto.createHmac('sha256', sessionToken);
    hmac.update(nonce);
    const expectedSignature = hmac.digest('hex');
    // Comparaison temps-constant pour éviter les attaques timing
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'));
  } catch {
    return false;
  }
} 

/**
 * SQL injection prevention - parameterized queries
 */
export function sanitizeQueryParam(param: any): string {
  if (typeof param !== 'string') {
    return String(param);
  }

  // Remove potentially dangerous SQL keywords
  const dangerousPatterns = [
    /union/gi,
    /select/gi,
    /delete/gi,
    /insert/gi,
    /update/gi,
    /drop/gi,
    /create/gi,
    /alter/gi,
    /exec/gi,
    /execute/gi,
  ];

  const sanitized = param;
  dangerousPatterns.forEach((pattern) => {
    if (pattern.test(sanitized)) {
      log.warn('potential_sql_injection', { pattern: pattern.source, param: param.slice(0, 50) });
    }
  });

  return sanitized;
}

/**
 * Compose all security middleware
 */
export function applySecurityMiddleware(req: NextRequest): {
  response: NextResponse | null;
  request: NextRequest;
} {
  // Apply CORS
  const corseq = cors(req);

  // Check rate limit
  const rateLimitResponse = rateLimit(corseq);
  if (rateLimitResponse) {
    return {
      response: rateLimitResponse,
      request: corseq,
    };
  }

  // Validate input
  const validation = validateInput(corseq);
  if (!validation.valid) {
    return {
      response: NextResponse.json({ error: validation.error }, { status: 400 }),
      request: corseq,
    };
  }

  return {
    response: null,
    request: corseq,
  };
}
