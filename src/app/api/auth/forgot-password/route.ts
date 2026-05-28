<<<<<<< HEAD
/**
 * GENOVA AI OS — POST /api/auth/forgot-password
 * Sends password reset email.
 *
 * Security:
 *  - Always returns 200 (prevents email enumeration)
 *  - Rate limited per IP
 *  - Token hashed before DB storage
 *  - Token expires in 1 hour
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateResetToken, hashToken, createAuditLog } from '@/lib/auth';
import { forgotPasswordSchema, formatZodErrors } from '@/lib/validations/auth';
import { rateLimit } from '@/lib/rate-limit';
import { sendPasswordResetEmail } from '@/lib/mailer';
import { createLogger } from '@/lib/logger';

const log = createLogger('forgot-password');

const SUCCESS_RESPONSE = {
  message: 'Si un compte existe pour cet email, vous recevrez un lien de réinitialisation.',
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  // Rate limit: 3 req / 15 min per IP
  const rl = await rateLimit(`forgot:${ip}`, { max: 3, windowMs: 15 * 60 * 1000 });
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
      { status: 429 }
    );
=======
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { applySecurity, secureResponse } from '@/lib/security';

// Always return the same response regardless of whether the email exists
const SUCCESS_RESPONSE = {
  message:
    'If an account with that email exists, a verification code has been sent.',
};

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  const { error: secError } = await applySecurity(request, {
    rateLimit: { limit: 5, windowMs: 60000 },
  });
  if (secError) return secError;

  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      const res = NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Normalize email
    const normalizedEmail = String(email).trim().toLowerCase();

    // Input length validation
    if (email.length > 255) {
      const res = NextResponse.json(
        { error: 'Email must be at most 255 characters' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Always return the same response to prevent email enumeration
    const user = await db.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      const res = NextResponse.json(SUCCESS_RESPONSE);
      return secureResponse(res, request);
    }

    // Generate 6-digit code using cryptographically secure random
    const code = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Invalidate any existing reset codes for this email
    await db.passwordReset.updateMany({
      where: { email: normalizedEmail, used: false },
      data: { used: true },
    });

    // Create new reset code
    await db.passwordReset.create({
      data: {
        email: normalizedEmail,
        code,
        expiresAt,
        userId: user.id,
      },
    });

    // Send email
    await sendEmail(
      normalizedEmail,
      'Password Reset Code - Genova AgentOS',
      `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a1a;">Password Reset</h2>
        <p>You requested a password reset for your Genova AgentOS account.</p>
        <p style="font-size: 24px; font-weight: bold; letter-spacing: 2px; padding: 12px 24px; background: #f5f5f5; border-radius: 8px; text-align: center;">
          ${code}
        </p>
        <p>This code expires in 15 minutes.</p>
        <p style="color: #666; font-size: 12px;">If you didn't request this reset, please ignore this email.</p>
      </div>
    `
    );

    const res = NextResponse.json(SUCCESS_RESPONSE);
    return secureResponse(res, request);
  } catch {
    // Still return success to prevent email enumeration
    const res = NextResponse.json(SUCCESS_RESPONSE);
    return secureResponse(res, request);
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
  }

  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Email invalide', fields: formatZodErrors(parsed.error) },
      { status: 422 }
    );
  }

  const { email } = parsed.data;

  // Always respond with success regardless of whether user exists
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, isActive: true },
  });

  if (!user || !user.isActive) {
    log.info('Email not found or inactive', { email, ip });
    return NextResponse.json(SUCCESS_RESPONSE);
  }

  // Invalidate existing reset tokens for this user
  await db.passwordReset.deleteMany({ where: { userId: user.id } });

  // Generate + hash token
  const rawToken = generateResetToken();
  const hashedToken = await hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.passwordReset.create({
    data: { userId: user.id, token: hashedToken, expiresAt },
  });

  await createAuditLog({
    userId: user.id,
    action: 'PASSWORD_RESET_REQUESTED',
    resource: 'user',
    ipAddress: ip,
    userAgent: req.headers.get('user-agent') ?? 'unknown',
    severity: 'info',
  });

  try {
    await sendPasswordResetEmail({ to: user.email, name: user.name, token: rawToken });
  } catch (err) {
    log.error('Failed to send email', { err, userId: user.id });
  }

  log.info('Reset token created', { userId: user.id });
  return NextResponse.json(SUCCESS_RESPONSE);
}
