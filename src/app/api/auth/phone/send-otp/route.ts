// ============================================================
// POST /api/auth/phone/send-otp — Envoie un code SMS OTP
// ============================================================
//  Body: { phone: string }
//  Rate limit: 3/hour (anti-spam SMS)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { sendOtp, isValidPhoneNumber, normalizePhoneNumber } from '@/lib/phone-auth';
import { withRateLimit, RATE_LIMIT_PRESETS } from '@/lib/api-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handler(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json().catch(() => null);
    const phone = body?.phone as string | undefined;

    if (!phone) {
      return NextResponse.json({ error: 'Numéro de téléphone requis' }, { status: 400 });
    }

    if (!isValidPhoneNumber(phone)) {
      return NextResponse.json({ error: 'Numéro de téléphone invalide. Ex: 690123456 ou +237690123456' }, { status: 400 });
    }

    const normalized = normalizePhoneNumber(phone);
    const result = await sendOtp(normalized);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 429 });
    }

    return NextResponse.json({
      success: true,
      message: `Code de vérification envoyé par SMS au ${normalized}`,
      expiresIn: 300,
    });
  } catch (error) {
    console.error('[phone-auth] send-otp error:', error);
    return NextResponse.json({ error: 'Erreur lors de l\'envoi du code' }, { status: 500 });
  }
}

export const POST = withRateLimit(handler, RATE_LIMIT_PRESETS.otp);
