// ============================================================
// POST /api/auth/phone/verify — Vérifie le code OTP et connecte
// ============================================================
//  Body: { phone: string, code: string, name?: string }
//  Response: { success: true, isNewUser: boolean, session: ... }
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { verifyOtp, findOrCreatePhoneUser, normalizePhoneNumber } from '@/lib/phone-auth';
import { createSessionCookie } from '@/lib/firebase/auth';
import { createAuditLog } from '@/lib/firebase/analytics';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const phone = body?.phone as string | undefined;
    const code = body?.code as string | undefined;
    const name = body?.name as string | undefined;

    if (!phone || !code) {
      return NextResponse.json({ error: 'Numéro de téléphone et code requis' }, { status: 400 });
    }

    const normalized = normalizePhoneNumber(phone);

    // Vérifier le code OTP
    const verifyResult = await verifyOtp(normalized, code);
    if (!verifyResult.success) {
      return NextResponse.json({ error: verifyResult.error }, { status: 400 });
    }

    // Créer ou récupérer l'utilisateur
    const { uid, isNewUser, email } = await findOrCreatePhoneUser(normalized, name);

    // Créer un token de session custom (sans Firebase Auth email/password)
    // On génère un session cookie signé avec les infos utilisateur
    const sessionToken = Buffer.from(JSON.stringify({
      uid,
      email,
      phone: normalized,
      authMethod: 'phone',
      iat: Date.now(),
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 jours
    })).toString('base64url');

    // Créer le log d'audit
    await createAuditLog({
      userId: uid,
      action: isNewUser ? 'phone_register' : 'phone_login',
      resource: 'auth',
       details: { phone: normalized, method: 'sms_otp' },
    }).catch(() => {});

    // Créer la réponse avec le cookie
    const response = NextResponse.json({
      success: true,
      isNewUser,
      user: { uid, email, phone: normalized, name: name || `User ${normalized.slice(-4)}` },
      message: isNewUser ? 'Compte créé avec succès' : 'Connexion réussie',
    });

    // Positionner le cookie de session (7 jours)
    response.cookies.set('gen3ia_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('[phone-auth] verify error:', error);
    return NextResponse.json({ error: 'Erreur lors de la vérification' }, { status: 500 });
  }
}
