/**
 * GENOVA AI OS — POST /api/auth/reset-password
 *
 * Flow:
 *  1. Rate limiting
 *  2. Validate token + new password (Zod)
 *  3. Hash token → lookup in DB
 *  4. Check token expiry
 *  5. Hash new password
 *  6. Update user password + delete reset token
 *  7. Invalidate all existing sessions (security best practice)
 *  8. Audit log
 */

import { NextRequest, NextResponse } from 'next/server';
import nodeCrypto from 'crypto';
import { db } from '@/lib/db';
<<<<<<< HEAD
import { hashPassword, hashToken, createAuditLog } from '@/lib/auth';
import { deleteAllUserSessions } from '@/lib/session';
import { resetPasswordSchema, formatZodErrors } from '@/lib/validations/auth';
import { rateLimit } from '@/lib/rate-limit';
import { createLogger } from '@/lib/logger';

const log = createLogger('reset-password');

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  // Rate limit: 5 req / 15 min per IP
  const rl = await rateLimit(`reset:${ip}`, { max: 5, windowMs: 15 * 60 * 1000 });
  if (!rl.success) {
    return NextResponse.json({ error: 'Trop de tentatives.' }, { status: 429 });
=======
import { hashPassword } from '@/lib/auth';
import { deleteAllUserSessions } from '@/lib/session';
import { applySecurity, secureResponse } from '@/lib/security';

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
    const { email, code, newPassword } = body;

    if (!email || !code || !newPassword) {
      const res = NextResponse.json(
        { error: 'Email, code, and new password are required' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Input length validation
    if (email.length > 255) {
      const res = NextResponse.json(
        { error: 'Email must be at most 255 characters' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    if (newPassword.length < 8) {
      const res = NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    if (newPassword.length > 128) {
      const res = NextResponse.json(
        { error: 'Password must be at most 128 characters' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Find the reset entry without filtering by code (so we can track attempts)
    const resetEntry = await db.passwordReset.findFirst({
      where: {
        email,
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!resetEntry) {
      const res = NextResponse.json(
        { error: 'Invalid or expired verification code' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Check max attempts
    if (resetEntry.attempts >= 3) {
      await db.passwordReset.update({
        where: { id: resetEntry.id },
        data: { used: true },
      });
      const res = NextResponse.json(
        { error: 'Maximum attempts exceeded. Please request a new code.' },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Verify the code matches using timing-safe comparison
    const codeBuffer = Buffer.from(String(resetEntry.code), 'utf-8');
    const inputBuffer = Buffer.from(String(code), 'utf-8');
    const codeMatches = codeBuffer.length === inputBuffer.length
      && nodeCrypto.timingSafeEqual(codeBuffer, inputBuffer);

    if (!codeMatches) {
      await db.passwordReset.update({
        where: { id: resetEntry.id },
        data: { attempts: resetEntry.attempts + 1 },
      });
      const remaining = 3 - (resetEntry.attempts + 1);
      const res = NextResponse.json(
        {
          error: `Invalid verification code. ${remaining} attempts remaining.`,
        },
        { status: 400 }
      );
      return secureResponse(res, request);
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update user password
    await db.user.update({
      where: { id: resetEntry.userId },
      data: { password: hashedPassword },
    });

    // Mark reset code as used
    await db.passwordReset.update({
      where: { id: resetEntry.id },
      data: { used: true },
    });

    // Invalidate all existing sessions for this user
    await deleteAllUserSessions(resetEntry.userId);

    await db.activityLog.create({
      data: {
        action: 'Password Reset',
        details: JSON.stringify({ email }),
        category: 'auth',
        userId: resetEntry.userId,
      },
    });

    const res = NextResponse.json({
      message: 'Password has been reset successfully',
    });
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Password reset failed' },
      { status: 500 }
    );
    return secureResponse(res, request);
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
  }

  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', fields: formatZodErrors(parsed.error) },
      { status: 422 }
    );
  }

  const { token, password } = parsed.data;

  // Hash token for DB lookup
  const hashedToken = await hashToken(token);

  const resetRecord = await db.passwordReset.findFirst({
    where: { token: hashedToken },
    include: { user: { select: { id: true, email: true, isActive: true } } },
  });

  if (!resetRecord) {
    log.warn('Invalid token attempt', { ip });
    return NextResponse.json({ error: 'Lien invalide ou expiré.' }, { status: 400 });
  }

  if (resetRecord.expiresAt < new Date()) {
    await db.passwordReset.delete({ where: { id: resetRecord.id } });
    return NextResponse.json(
      { error: 'Ce lien a expiré. Veuillez faire une nouvelle demande.' },
      { status: 400 }
    );
  }

  if (!resetRecord.user.isActive) {
    return NextResponse.json({ error: 'Ce compte est désactivé.' }, { status: 403 });
  }

  const hashedPassword = await hashPassword(password);

  await db.$transaction(async (tx) => {
    // Update password
    await tx.user.update({
      where: { id: resetRecord.user.id },
      data: { password: hashedPassword },
    });

    // Delete used token
    await tx.passwordReset.delete({ where: { id: resetRecord.id } });

    // Invalidate ALL sessions (force re-login everywhere)
    await tx.session.deleteMany({ where: { userId: resetRecord.user.id } });

    // Audit
    await tx.auditLog.create({
      data: {
        userId: resetRecord.user.id,
        action: 'PASSWORD_RESET_SUCCESS',
        resource: 'user',
        details: JSON.stringify({ ip, sessionsInvalidated: true }),
        ipAddress: ip,
        userAgent: req.headers.get('user-agent') ?? 'unknown',
        severity: 'warning',
      },
    });
  });

  log.info('Password reset successful', { userId: resetRecord.user.id });

  return NextResponse.json({ message: 'Mot de passe réinitialisé avec succès.' });
}
