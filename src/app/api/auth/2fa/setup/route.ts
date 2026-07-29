// ============================================================
// POST /api/auth/2fa/setup — Générer le secret TOTP et QR code
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateTOTPSecret, generateTOTPUrl } from '@/lib/twofa';
import { createLogger } from '@/lib/logger';

const log = createLogger('2fa-setup');

export async function POST(request: NextRequest) {
  try {
    // Authentification requise
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, totpSecret: true, isTwoFactorEnabled: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
    }

    if (user.isTwoFactorEnabled && user.totpSecret) {
      return NextResponse.json({ error: '2FA déjà activée. Désactivez-la d\'abord.' }, { status: 400 });
    }

    // Générer un nouveau secret
    const secret = generateTOTPSecret();
    const otpauthUrl = generateTOTPUrl(secret, user.email);

    // Stocker le secret temporairement (sera validé à l'étape verify)
    await db.user.update({
      where: { id: userId },
      data: { totpSecret: secret, isTwoFactorEnabled: false },
    });

    log.info('2fa_secret_generated', { userId: userId.slice(0, 8) });

    return NextResponse.json({
      success: true,
      secret,
      otpauthUrl,
      message: 'Scannez le QR code avec Google Authenticator ou Authy',
    });
  } catch (error) {
    log.error('2fa_setup_error', { error: String(error) });
    return NextResponse.json({ error: 'Erreur lors de la configuration 2FA' }, { status: 500 });
  }
}
