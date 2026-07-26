import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';

const log = createLogger('api-whatsapp');

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentification requise' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const secret = process.env.AUTH_SECRET;
    if (!secret || secret.length < 32) {
      return NextResponse.json({ error: 'Configuration du secret invalide' }, { status: 500 });
    }

    const { verify } = await import('jsonwebtoken');
    let decoded: { userId: string };
    try {
      decoded = verify(token, secret) as { userId: string };
    } catch {
      return NextResponse.json({ error: 'Token invalide ou expiré' }, { status: 401 });
    }

    const config = await db.whatsAppConfig.findUnique({
      where: { userId: decoded.userId },
    });

    return NextResponse.json(config || null);
  } catch (error) {
    log.error('WhatsApp GET error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, phoneNumber, apiToken, isActive } = body;

    if (!userId || !phoneNumber) {
      return NextResponse.json({ error: 'userId et phoneNumber requis' }, { status: 400 });
    }

    if (!/^\+?[1-9]\d{6,14}$/.test(phoneNumber)) {
      return NextResponse.json({ error: 'Format de numéro invalide (ex: +237671234567)' }, { status: 400 });
    }

    const config = await db.whatsAppConfig.upsert({
      where: { userId },
      update: { phoneNumber, apiToken, isActive: isActive || false },
      create: { userId, phoneNumber, apiToken, isActive: isActive || false },
    });

    log.info('WhatsApp config saved', { userId: userId.slice(0, 8), phoneNumber });

    return NextResponse.json(config, { status: 201 });
  } catch (error) {
    log.error('WhatsApp POST error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Erreur lors de la sauvegarde' }, { status: 500 });
  }
}