import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendPasswordReset } from '@/lib/email/auth-emails';
import crypto from 'crypto';

const SUCCESS_RESPONSE = {
  message: 'Si un compte existe pour cet email, vous recevrez un code de verification.',
};

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ error: 'Email requis' }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } });

    // Toujours retourner succes (pas d'enumeration d'emails)
    if (!user) {
      return NextResponse.json(SUCCESS_RESPONSE);
    }

    // Desactiver les anciens tokens
    await db.passwordReset.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    // Generer un token
    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    await db.passwordReset.create({
      data: {
        token: hashedToken,
        email: user.email,
        userId: user.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    // Envoyer l'email (non bloquant)
    sendPasswordReset(user.email, user.name, token).catch(err =>
      console.error('[Email] Erreur envoi reset:', err)
    );

    return NextResponse.json(SUCCESS_RESPONSE);
  } catch (error) {
    console.error('Forgot-password error:', error);
    return NextResponse.json(SUCCESS_RESPONSE);
  }
}
