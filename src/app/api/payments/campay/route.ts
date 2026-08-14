// ============================================================
// POST /api/payments/campay — Initier un paiement via Campay (USSD Push)
// ============================================================
//  Body: { phone, amount, operator?, description?, userId }
//  Response: { success, reference, message }
//
//  Contrairement à Chariow (redirection web), Campay envoie
//  directement le prompt de paiement sur le téléphone.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { campay } from '@/lib/payment/campay';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';

const log = createLogger('campay-api');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const { phone, amount, operator, description, userId, type, planId, packId } = body;

    if (!phone || !amount) {
      return NextResponse.json({ error: 'phone et amount sont requis' }, { status: 400 });
    }

    if (!campay.isConfigured()) {
      return NextResponse.json(
        { error: 'Campay non configuré. Définissez CAMPAY_USERNAME et CAMPAY_PASSWORD.' },
        { status: 503 }
      );
    }

    // Générer une référence unique
    const reference = `gen3ia_${type || 'payment'}_${userId || 'anon'}_${Date.now()}`;

    const result = await campay.collect({
      amount: Number(amount),
      phone,
      operator,
      description: description || `Gen3ia ${type || 'paiement'}`,
      reference,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    // Sauvegarder la transaction en attente
    await db.creditTransaction.create({
      data: {
        userId: userId || 'unknown',
        amount: 0, // Sera crédité à la confirmation
        type: 'purchase',
        status: 'pending',
        reference,
        provider: 'campay',
        metadata: JSON.stringify({
          phone,
          amount: Number(amount),
          operator: operator || 'auto',
          type,
          planId,
          packId,
          campayRef: result.transactionId,
        }),
        createdAt: new Date(),
      },
    }).catch(err => log.error('Failed to save pending transaction', { error: String(err) }));

    return NextResponse.json({
      success: true,
      reference: result.reference,
      message: result.message,
      status: 'pending',
    });
  } catch (error) {
    console.error('[campay] API error:', error);
    return NextResponse.json({ error: 'Erreur lors de l\\'initiation du paiement' }, { status: 500 });
  }
}
