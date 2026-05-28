<<<<<<< HEAD
/**
 * GENOVA AI OS — POST /api/auth/register
 * Production-ready registration endpoint.
 *
 * Flow:
 *  1. Rate limiting (5 req/15min per IP)
 *  2. Zod validation
 *  3. Duplicate email check (anti-enumeration: same success message)
 *  4. PBKDF2 password hash
 *  5. Create user (role: user, isActive: false until email verified)
 *  6. Create email verification record (PBKDF2-hashed token)
 *  7. Send verification email
 *  8. Audit log
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, generateResetToken, hashToken, createAuditLog } from '@/lib/auth';
import { registerSchema, formatZodErrors } from '@/lib/validations/auth';
import { rateLimit } from '@/lib/rate-limit';
import { sendVerificationEmail } from '@/lib/mailer';
import { createLogger } from '@/lib/logger';

const log = createLogger('register');

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  // ── 1. Rate Limiting ──────────────────────────────────────────────────────
  const rl = await rateLimit(`register:${ip}`, { max: 5, windowMs: 15 * 60 * 1000 });
  if (!rl.success) {
    log.warn('Rate limit exceeded', { ip });
    return NextResponse.json(
      { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
      { status: 429, headers: { 'Retry-After': '900' } }
    );
=======
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, createAuditLog } from '@/lib/auth';
import { createSession, setSessionCookie, setRefreshCookie } from '@/lib/session';
import { sendEmail } from '@/lib/email';
import { applySecurity, secureResponse } from '@/lib/security';

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  const { error: secError } = await applySecurity(request, {
    rateLimit: { limit: 10, windowMs: 60000 },
  });
  if (secError) return secError;

  try {
    const body = await request.json();
    let { email, name, password } = body;

    if (!email || !name || !password) {
      const res = NextResponse.json(
        { error: 'Name, email, and password are required' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Normalize email
    email = String(email).trim().toLowerCase();

    // Sanitize name - strip HTML tags
    name = String(name).trim().replace(/<[^>]*>/g, '').slice(0, 100);

    if (email.length > 255) {
      const res = NextResponse.json(
        { error: 'Email must be at most 255 characters' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    if (password.length > 128) {
      const res = NextResponse.json(
        { error: 'Password must be at most 128 characters' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      const res = NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Validate password strength
    if (password.length < 8) {
      const res = NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Check uniqueness
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      const res = NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      );
      return secureResponse(res, request);
    }

    const hashedPassword = await hashPassword(password);
    const user = await db.user.create({
      data: { email, name, password: hashedPassword },
    });

    // Generate email verification code
    const verificationCode = crypto.randomInt(100000, 1000000).toString();
    const verificationExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await db.emailVerification.create({
      data: {
        email,
        code: verificationCode,
        expiresAt: verificationExpiresAt,
        userId: user.id,
      },
    });

    // Send verification email (non-blocking)
    await sendEmail(
      email,
      'Verify Your Email - Genova AgentOS',
      `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a1a;">Welcome to Genova AgentOS!</h2>
        <p>Thank you for registering. Please use the following code to verify your email address:</p>
        <p style="font-size: 24px; font-weight: bold; letter-spacing: 2px; padding: 12px 24px; background: #f5f5f5; border-radius: 8px; text-align: center;">
          ${verificationCode}
        </p>
        <p>This code expires in 15 minutes.</p>
        <p style="color: #666; font-size: 12px;">If you didn't create an account, please ignore this email.</p>
      </div>
    `
    );

    // Create session with IP and UA info
    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      undefined;
    const userAgent = request.headers.get('user-agent') || undefined;

    const { token, refreshToken } = await createSession(user.id, {
      ipAddress,
      userAgent,
    });

    await db.activityLog.create({
      data: {
        action: 'Registration',
        details: JSON.stringify({ email }),
        category: 'auth',
        userId: user.id,
      },
    });

    const res = NextResponse.json(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        avatar: user.avatar,
        role: user.role || 'user',
        emailVerificationRequired: true,
      },
      { status: 201 }
    );
    setSessionCookie(res, token);
    setRefreshCookie(res, refreshToken);

    // Audit log for registration
    await createAuditLog({
      userId: user.id,
      action: 'registration',
      resource: 'user',
      resourceId: user.id,
      ipAddress,
      userAgent,
      severity: 'info',
    });

    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Registration failed' },
      { status: 500 }
    );
    return secureResponse(res, request);
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)
  }

  // ── 2. Parse & Validate ───────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', fields: formatZodErrors(parsed.error) },
      { status: 422 }
    );
  }

  const { name, email, password } = parsed.data;

  // ── 3. Check for existing user (constant-time to prevent enumeration) ─────
  const existing = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existing) {
    // Don't reveal user existence — log and return same-shape success
    log.info('Duplicate email attempt', { email, ip });
    // Still hash to consume constant time
    await hashPassword(password);
    return NextResponse.json(
      { message: 'Si cet email est disponible, un email de vérification sera envoyé.' },
      { status: 200 }
    );
  }

  // ── 4. Hash Password ──────────────────────────────────────────────────────
  let hashedPassword: string;
  try {
    hashedPassword = await hashPassword(password);
  } catch (err) {
    log.error('Password hashing failed', { err });
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 });
  }

  // ── 5. Create User + Email Verification ──────────────────────────────────
  let user: { id: string; email: string; name: string };
  let verificationToken: string;

  try {
    verificationToken = generateResetToken();
    const hashedVerifToken = await hashToken(verificationToken);
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: 'user',
          isActive: false, // activated upon email verification
          isEmailVerified: false,
        },
        select: { id: true, email: true, name: true },
      });

      await tx.emailVerification.create({
        data: {
          userId: created.id,
          token: hashedVerifToken,
          expiresAt: tokenExpiry,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: created.id,
          action: 'USER_REGISTERED',
          resource: 'user',
          resourceId: created.id,
          details: JSON.stringify({ email, ip }),
          ipAddress: ip,
          userAgent: req.headers.get('user-agent') ?? 'unknown',
        },
      });

      return created;
    });
  } catch (err) {
    log.error('Database error during user creation', { err, email });
    return NextResponse.json({ error: 'Erreur lors de la création du compte' }, { status: 500 });
  }

  // ── 6. Send Verification Email ────────────────────────────────────────────
  try {
    await sendVerificationEmail({
      to: user.email,
      name: user.name,
      token: verificationToken,
    });
  } catch (err) {
    // Non-blocking: user was created, just couldn't send email
    log.error('Failed to send verification email', { err, userId: user.id });
  }

  log.info('User created successfully', { userId: user.id, email });

  return NextResponse.json(
    { message: 'Compte créé. Vérifiez votre email pour activer votre compte.' },
    { status: 201 }
  );
}
