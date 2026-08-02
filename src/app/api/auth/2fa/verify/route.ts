// ============================================================
// POST /api/auth/2fa/verify — Vérifier et activer la 2FA
// POST /api/auth/2fa/verify?login=true — Vérifier lors du login
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyTOTPCode, verifyBackupCode } from '@/lib/twofa';
import { createLogger } from '@/lib/logger';





export const dynamic = "force-dynamic";
const log = createLogger('2fa-verify');

export async function POST(request: NextRequest) {
  try {
    const { code, isBackupCode } = await request.json();
    const isLoginFlow = request.nextUrl.searchParams.get('login') === 'true';

    if (!code) {
      return NextResponse.json({ error: 'Code 2FA requis' }, { status: 400 });
    }

    // Mode login : vérifier via email
    if (isLoginFlow) {
      const email = request.headers.get('x-user-email');
      if (!email) {
        return NextResponse.json({ error: 'Email requis' }, { status: 400 });
      }

      const user = await db.user.findUnique({
        where: { email },
        select: { id: true, totpSecret: true, backupCodes: true },
      });

      if (!user || !user.totpSecret) {
        return NextResponse.json({ error: '2FA non configurée' }, { status: 400 });
      }

      const isValid = isBackupCode
        ? verifyBackupCode(code, JSON.parse(user.backupCodes || '[]'))
        : verifyTOTPCode(user.totpSecret, code);

      if (!isValid) {
        log.warn('2fa_verify_failed', { userId: user.id.slice(0, 8), isBackupCode: !!isBackupCode });
        return NextResponse.json({ error: 'Code invalide' }, { status: 401 });
      }

      // Marquer la vérification 2FA
      await db.user.update({
        where: { id: user.id },
        data: { twoFactorVerifiedAt: new Date() },
      });

      log.info('2fa_verified_login', { userId: user.id.slice(0, 8) });

      return NextResponse.json({ success: true, verified: true });
    }

    // Mode activation : vérifier via userId
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, totpSecret: true },
    });

    if (!user || !user.totpSecret) {
      return NextResponse.json({ error: 'Secret 2FA non trouvé. Faites /setup d\'abord.' }, { status: 400 });
    }

    const isValid = verifyTOTPCode(user.totpSecret, code);
    if (!isValid) {
      return NextResponse.json({ error: 'Code invalide. Vérifiez l\'heure de votre appareil.' }, { status: 401 });
    }

    // Activer la 2FA
    await db.user.update({
      where: { id: userId },
      data: { isTwoFactorEnabled: true, twoFactorVerifiedAt: new Date() },
    });

    log.info('2fa_activated', { userId: userId.slice(0, 8) });

    return NextResponse.json({
      success: true,
      enabled: true,
      message: '2FA activée avec succès !',
    });
  } catch (error) {
    log.error('2fa_verify_error', { error: String(error) });
    return NextResponse.json({ error: 'Erreur de vérification' }, { status: 500 });
  }
}
