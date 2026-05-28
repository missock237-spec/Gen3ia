<<<<<<< HEAD
/**
 * GENOVA AI OS — POST /api/auth/resend-verification
 * Resends email verification link (uses new PBKDF2 token system).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateResetToken, hashToken } from '@/lib/auth';
import { sendVerificationEmail } from '@/lib/mailer';
import { rateLimit } from '@/lib/rate-limit';
import { createLogger } from '@/lib/logger';

const log = createLogger('resend-verification');

const SUCCESS_RESPONSE = {
  message: 'If the email exists and is not yet verified, a new verification email has been sent.',
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  // Rate limit: 3 req / 15 min per IP
  const rl = await rateLimit(`resend:${ip}`, { max: 3, windowMs: 15 * 60 * 1000 });
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
      { status: 429 }
    );
  }

  try {
    const body = await request.json();
    const email = body.email;

    if (!email) {
      return NextResponse.json({ error: 'Email requis' }, { status: 400 });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    if (normalizedEmail.length > 255) {
      return NextResponse.json({ error: 'Email trop long' }, { status: 400 });
=======
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { applySecurity, secureResponse } from '@/lib/security';

// Always return same response to prevent enumeration
const SUCCESS_RESPONSE = {
  message: 'If the email exists and is not yet verified, a new verification code has been sent.',
};

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  const { error: secError } = await applySecurity(request, {
    rateLimit: { limit: 3, windowMs: 60000 },
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
    if (normalizedEmail.length > 255) {
      const res = NextResponse.json(
        { error: 'Email must be at most 255 characters' },
        { status: 400 }
      );
      return secureResponse(res, request);
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)
    }

    // Always return same response to prevent enumeration
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
<<<<<<< HEAD
      select: { id: true, name: true, email: true, isEmailVerified: true },
    });

    if (!user || user.isEmailVerified) {
      return NextResponse.json(SUCCESS_RESPONSE);
    }

    // Invalidate any existing verification tokens for this user
    await db.emailVerification.deleteMany({ where: { userId: user.id } });

    // Generate new PBKDF2-hashed token
    const rawToken = generateResetToken();
    const hashedToken = await hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    await db.emailVerification.create({
      data: {
        userId: user.id,
        token: hashedToken,
        expiresAt,
=======
      select: { id: true, emailVerified: true },
    });

    if (!user || user.emailVerified) {
      const res = NextResponse.json(SUCCESS_RESPONSE);
      return secureResponse(res, request);
    }

    // Invalidate any existing unused verification codes for this email
    await db.emailVerification.updateMany({
      where: { email: normalizedEmail, used: false },
      data: { used: true },
    });

    // Generate 6-digit code using cryptographically secure random
    const code = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Create new verification code
    await db.emailVerification.create({
      data: {
        email: normalizedEmail,
        code,
        expiresAt,
        userId: user.id,
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)
      },
    });

    // Send verification email
<<<<<<< HEAD
    try {
      await sendVerificationEmail({
        to: user.email,
        name: user.name,
        token: rawToken,
      });
    } catch (err) {
      log.error('Failed to send verification email', { err, userId: user.id });
    }

    return NextResponse.json(SUCCESS_RESPONSE);
  } catch {
    return NextResponse.json(SUCCESS_RESPONSE);
=======
    await sendEmail(
      normalizedEmail,
      'Email Verification Code - Genova AgentOS',
      `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a1a;">Verify Your Email</h2>
        <p>Thank you for registering with Genova AgentOS. Please use the following code to verify your email address:</p>
        <p style="font-size: 24px; font-weight: bold; letter-spacing: 2px; padding: 12px 24px; background: #f5f5f5; border-radius: 8px; text-align: center;">
          ${code}
        </p>
        <p>This code expires in 15 minutes.</p>
        <p style="color: #666; font-size: 12px;">If you didn't create an account, please ignore this email.</p>
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
}
