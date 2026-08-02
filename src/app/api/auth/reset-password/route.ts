/**
 * GENOVA AI OS — POST /api/auth/reset-password
 *
 * Flow:
 *  1. Rate limiting (via applySecurity)
 *  2. Validate token + new password (Zod)
 *  3. Hash token → lookup in DB
 *  4. Check token expiry
 *  5. Hash new password
 *  6. Update user password + delete reset token
 *  7. Invalidate all existing sessions (security best practice)
 *  8. Audit log
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, hashToken } from '@/lib/auth';
import { deleteAllUserSessions } from '@/lib/session';
import { resetPasswordSchema, formatZodErrors } from '@/lib/validations/auth';
import { applySecurity, secureResponse } from '@/lib/security';
import { createLogger } from '@/lib/logger';





export const dynamic = "force-dynamic";
const log = createLogger('reset-password');

export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { error: secError } = await applySecurity(req, {
    rateLimit: { limit: 5, windowMs: 15 * 60 * 1000 },
  });
  if (secError) return secError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    const res = NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
    return secureResponse(res, req);
  }

  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    const res = NextResponse.json(
      { error: 'Données invalides', fields: formatZodErrors(parsed.error) },
      { status: 422 }
    );
    return secureResponse(res, req);
  }

  const { token, password } = parsed.data;

  // Hash token for DB lookup
  const hashedToken = await hashToken(token);

  const resetRecord = await db.passwordReset.findFirst({
    where: { token: hashedToken },
    include: { user: { select: { id: true, email: true, isActive: true } } },
  });

  if (!resetRecord) {
    log.warn('Invalid token attempt');
    const res = NextResponse.json({ error: 'Lien invalide ou expiré.' }, { status: 400 });
    return secureResponse(res, req);
  }

  if (resetRecord.expiresAt < new Date()) {
    await db.passwordReset.delete({ where: { id: resetRecord.id } });
    const res = NextResponse.json(
      { error: 'Ce lien a expiré. Veuillez faire une nouvelle demande.' },
      { status: 400 }
    );
    return secureResponse(res, req);
  }

  if (!resetRecord.user.isActive) {
    const res = NextResponse.json({ error: 'Ce compte est désactivé.' }, { status: 403 });
    return secureResponse(res, req);
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
        details: JSON.stringify({ sessionsInvalidated: true }),
        severity: 'warning',
      },
    });
  });

  log.info('Password reset successful', { userId: resetRecord.user.id });

  const res = NextResponse.json({ message: 'Mot de passe réinitialisé avec succès.' });
  return secureResponse(res, req);
}
