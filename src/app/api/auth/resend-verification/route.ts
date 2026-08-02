/**
 * GENOVA AI OS — POST /api/auth/resend-verification
 * Resends email verification link (uses new PBKDF2 token system).
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateResetToken, hashToken } from '@/lib/auth';
import { sendVerificationEmail } from '@/lib/mailer';
import { applySecurity, secureResponse } from '@/lib/security';
import { createLogger } from '@/lib/logger';





export const dynamic = "force-dynamic";
const log = createLogger('resend-verification');

const SUCCESS_RESPONSE = {
  message: 'If the email exists and is not yet verified, a new verification email has been sent.',
};

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { error: secError } = await applySecurity(request, {
    rateLimit: { limit: 3, windowMs: 15 * 60 * 1000 },
  });
  if (secError) return secError;

  try {
    const body = await request.json();
    const email = body.email;

    if (!email) {
      const res = NextResponse.json({ error: 'Email requis' }, { status: 400 });
      return secureResponse(res, request);
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    if (normalizedEmail.length > 255) {
      const res = NextResponse.json({ error: 'Email trop long' }, { status: 400 });
      return secureResponse(res, request);
    }

    // Always return same response to prevent enumeration
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, name: true, email: true, isEmailVerified: true },
    });

    if (!user || user.isEmailVerified) {
      const res = NextResponse.json(SUCCESS_RESPONSE);
      return secureResponse(res, request);
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
      },
    });

    // Send verification email
    try {
      await sendVerificationEmail({
        to: user.email,
        name: user.name,
        token: rawToken,
      });
    } catch (err) {
      log.error('Failed to send verification email', { err, userId: user.id });
    }

    const res = NextResponse.json(SUCCESS_RESPONSE);
    return secureResponse(res, request);
  } catch {
    // Still return success to prevent email enumeration
    const res = NextResponse.json(SUCCESS_RESPONSE);
    return secureResponse(res, request);
  }
}
