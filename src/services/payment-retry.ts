// Payment Retry — Relance des paiements echoues via SubPay

import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { subpay } from '@/lib/payment/subpay';

const log = createLogger('payment-retry');

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 60_000;
const BACKOFF_MULTIPLIER = 4;
const RETRYABLE_STATUSES = ['failed', 'pending'];
const NON_RETRYABLE_ERRORS = ['card_declined', 'expired_card', 'insufficient_balance', 'invalid_phone'];

export class PaymentRetryManager {
  private processing = new Set<string>();

  async processFailedPayments() {
    let processed = 0, succeeded = 0, failed = 0;
    try {
      const pendingInvoices = await db.invoice.findMany({
        where: { status: { in: RETRYABLE_STATUSES }, retryCount: { lt: MAX_RETRIES }, nextRetryAt: { lte: new Date() } },
        orderBy: { nextRetryAt: 'asc' }, take: 20,
        include: { user: { select: { id: true, email: true, credits: true } } },
      });
      for (const invoice of pendingInvoices) {
        if (this.processing.has(invoice.id)) continue;
        this.processing.add(invoice.id); processed++;
        try {
          const result = await this.retryWithSubPay(invoice);
          if (result.success) {
            await db.invoice.update({ where: { id: invoice.id }, data: { status: 'paid', retryCount: { increment: 1 }, paidAt: new Date(), transactionId: result.transactionId, nextRetryAt: null } });
            if (invoice.user) await db.user.update({ where: { id: invoice.user.id }, data: { credits: { increment: invoice.amount * 100 } } });
            succeeded++;
          } else {
            const rc = invoice.retryCount + 1;
            const retry = rc < MAX_RETRIES && !this.isNonRetryable(result.error || '');
            const delay = retry ? BASE_DELAY_MS * Math.pow(BACKOFF_MULTIPLIER, rc - 1) : null;
            await db.invoice.update({ where: { id: invoice.id }, data: { retryCount: rc, lastRetryError: result.error?.slice(0, 500), nextRetryAt: delay ? new Date(Date.now() + delay) : null, status: retry ? 'pending' : 'failed' } });
            failed++;
          }
        } catch (e) { failed++; } finally { this.processing.delete(invoice.id); }
      }
    } catch (e) {}
    return { processed, succeeded, failed };
  }

  private async retryWithSubPay(invoice: any) {
    if (!subpay.isConfigured()) return { success: false, error: 'SubPay non configure' };
    try {
      const result = await subpay.initiatePayment({
        amount: invoice.amount, currency: 'XAF', provider: 'mtn',
        phone: invoice.user?.phone || '', reference: `retry_${invoice.id}_${Date.now()}`,
        description: 'Relance paiement', metadata: { invoiceId: invoice.id },
      });
      if (result.status === 'completed') return { success: true, transactionId: result.id };
      return { success: false, error: 'Statut: ' + result.status };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur SubPay' };
    }
  }

  private isNonRetryable(error: string) {
    return NON_RETRYABLE_ERRORS.some(e => error.toLowerCase().includes(e));
  }

  async scheduleRetry(invoiceId: string, delayMs = BASE_DELAY_MS) {
    await db.invoice.update({ where: { id: invoiceId }, data: { nextRetryAt: new Date(Date.now() + delayMs), status: 'pending' } });
  }

  getActiveRetries() { return this.processing.size; }
}

export const paymentRetry = new PaymentRetryManager();