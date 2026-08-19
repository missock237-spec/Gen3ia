// ============================================================
// POST /api/payments/campay/webhook — Webhook Campay
// ============================================================
//  Campay appelle ce endpoint pour notifier le statut du paiement.
//  Si succès → créditer les crédits de l'utilisateur.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { campay } from '@/lib/payment/campay';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';

const log = createLogger('campay-webhook');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const signature = req.headers.get('x-campay-signature') || '';

    // Vérifier la signature (si configuré)
    const rawBody = JSON.stringify(body);
    if (campay.verifyWebhookSignature(rawBody, signature)) {
      log.info('Webhook signature verified');
    } else {
      log.warn('Webhook signature mismatch — processing anyway (dev mode)');
    }

    const { reference, status, amount, transaction_id } = body;

    if (!reference) {
      return NextResponse.json({ error: 'reference manquant' }, { status: 400 });
    }

    // Trouver la transaction en attente
    const transactions = await db.creditTransaction.findMany({ where: {} });
    const txn = (transactions as Record<string, unknown>[])
      .find(t => t.reference === reference && t.status === 'pending');

    if (!txn) {
      log.warn('Webhook: transaction not found', { reference });
      return NextResponse.json({ success: false, message: 'Transaction not found' }, { status: 404 });
    }

    const txnId = txn.id as string;
    const userId = txn.userId as string;
    const metadata = JSON.parse((txn.metadata as string) || '{}');

    if (status === 'success') {
      // Calculer les crédits à ajouter
      const paymentAmount = amount || metadata.amount || 0;
      // Taux de conversion: 1 USD = 1000 crédits, 1 USD ≈ 600 XAF
      // Donc 1 XAF ≈ 1.67 crédits
      const creditsToAdd = Math.round(paymentAmount * 1.67);

      // Créditer l'utilisateur
      await db.creditTransaction.update({
        where: { id: txnId },
        data: {
          status: 'completed',
          amount: creditsToAdd,
          metadata: JSON.stringify({
            ...metadata,
            confirmedAt: new Date().toISOString(),
            campayTransactionId: transaction_id,
            creditsAdded: creditsToAdd,
          }),
        },
      });

      // Mettre à jour le solde de l'utilisateur
      const user = await db.user.findUnique({ where: { id: userId } });
      if (user) {
        const currentCredits = (user as Record<string, unknown>).credits as number || 0;
        await db.user.update({
          where: { id: userId },
          data: { credits: currentCredits + creditsToAdd },
        });
      }

      log.info('Payment confirmed', { reference, userId, creditsToAdd });

      // Envoyer une notification de confirmation
      // (le hook SMS s'occupera de l'alerte)
    } else {
      // Paiement échoué
      await db.creditTransaction.update({
        where: { id: txnId },
        data: { status: 'failed' },
      });
      log.warn('Payment failed', { reference });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[campay-webhook] error:', error);
    return NextResponse.json({ error: 'Webhook error' }, { status: 500 });
  }
}
