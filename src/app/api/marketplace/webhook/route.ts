// ============================================================
// POST /api/marketplace/webhook — Webhook Sebpay Marketplace
// ------------------------------------------------------------
// Reçoit les notifications de paiement et de payout de Sebpay.
// Sur `payment.completed` :
//   1. Vérifie la signature HMAC SHA-256
//   2. Appelle `finalizeMarketplaceSebpayPurchase` qui :
//      - Marque l'achat comme `completed`
//      - Calcule la part vendeur (80%) + commission plateforme (20%)
//      - Met à jour les earnings du créateur
//      - Déclenche l'AUTO-PAYOUT 80% au créateur via Sebpay /v1/payouts
//
// Signature : header `x-sebpay-signature` (ou `sha256=...`).
// Secret : `SEBPAY_WEBHOOK_SECRET` (env var).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { sebpayMarketplace, type SebpayWebhookPayload } from '@/lib/payment/sebpay';
import { finalizeMarketplaceSebpayPurchase } from '@/lib/marketplace/purchase-system';
import { createLogger } from '@/lib/logger';

const log = createLogger('marketplace-sebpay-webhook');
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const signature =
    request.headers.get('x-sebpay-signature') ??
    request.headers.get('x-signature') ??
    '';

  // 1. Vérification signature HMAC
  if (!sebpayMarketplace.verifyWebhookSignature(raw, signature)) {
    log.warn('sebpay_webhook_invalid_signature');
    return NextResponse.json({ error: 'Signature invalide' }, { status: 401 });
  }

  // 2. Parse payload
  let payload: SebpayWebhookPayload;
  try {
    payload = JSON.parse(raw) as SebpayWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
  }

  log.info('sebpay_webhook_received', {
    event: payload.event,
    reference: payload.data?.reference,
  });

  // 3. Sur paiement buyer complété → finalize purchase + auto-payout 80%
  if (payload.event === 'payment.completed' || payload.data?.status === 'completed') {
    try {
      await finalizeMarketplaceSebpayPurchase({
        reference: payload.data.reference,
        transactionId: payload.data.id,
        status: 'completed',
        amount: payload.data.amount,
      });
      log.info('marketplace_purchase_finalized', { reference: payload.data.reference });
    } catch (error) {
      log.error('marketplace_purchase_finalize_failed', {
        reference: payload.data.reference,
        error: error instanceof Error ? error.message : String(error),
      });
      // On retourne 200 quand même pour éviter que Sebpay ne rejoue indéfiniment
      // le webhook (le purchase est peut-être déjà complété ou introuvable).
    }
  }

  // 4. Sur payout créateur complété → mettre à jour le CreatorPayout
  if (payload.event === 'payout.completed') {
    log.info('sebpay_payout_completed', {
      reference: payload.data.reference,
      amount: payload.data.payoutAmount,
    });
    // Le statut 'paid' est déjà positionné par le handler Sebpay quand il a initié
    // le payout. On peut aussi réconcilier ici avec un lookup CreatorPayout par
    // transactionId, mais pour l'instant on logge seulement.
  }

  if (payload.event === 'payout.failed') {
    log.warn('sebpay_payout_failed', {
      reference: payload.data.reference,
      metadata: payload.data.metadata,
    });
  }

  return NextResponse.json({ received: true });
}
