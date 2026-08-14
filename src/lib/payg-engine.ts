// ============================================================
// PAYG ENGINE — Paiement à l'usage (Pay-as-you-go)
// 14 ressources tarifées, recharge SebPay, seuils d'alerte
// ============================================================

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { addCredits } from '@/lib/billing/credits';
import { sebpay } from '@/lib/sebpay';

const log = createLogger('payg-engine');

// ============================================================
// TARIFS PAYG (XAF & USD)
// ============================================================

export interface PaygRate {
  resource: string;
  unit: string;
  priceXAF: number;
  priceUSD: number;
  description: string;
}

export const PAYG_RATES: PaygRate[] = [
  { resource: 'agent_run', unit: 'exécution', priceXAF: 50, priceUSD: 0.10, description: 'Exécution simple agent IA' },
  { resource: 'agent_complex', unit: 'exécution', priceXAF: 150, priceUSD: 0.30, description: 'Exécution complexe ReAct multi-tours' },
  { resource: 'token', unit: '1K tokens', priceXAF: 5, priceUSD: 0.01, description: 'Token LLM GPT-4o mini' },
  { resource: 'token_advanced', unit: '1K tokens', priceXAF: 25, priceUSD: 0.05, description: 'Token LLM GPT-4o / Claude' },
  { resource: 'image', unit: 'image', priceXAF: 250, priceUSD: 0.50, description: 'Generation image HuggingFace' },
  { resource: 'video', unit: 'seconde', priceXAF: 500, priceUSD: 1.00, description: 'Generation video' },
  { resource: 'voice_call', unit: 'minute', priceXAF: 100, priceUSD: 0.20, description: 'Appel vocal IA entrant' },
  { resource: 'voice_outbound', unit: 'minute', priceXAF: 250, priceUSD: 0.50, description: 'Appel vocal IA sortant' },
  { resource: 'audio_gen', unit: 'generation', priceXAF: 100, priceUSD: 0.20, description: 'Generation audio TTS' },
  { resource: 'workflow', unit: 'execution', priceXAF: 200, priceUSD: 0.40, description: 'Execution workflow multi-etapes' },
  { resource: 'memory_storage', unit: 'Mo/jour', priceXAF: 10, priceUSD: 0.02, description: 'Stockage memoire vectorielle' },
  { resource: 'integration', unit: 'appel API', priceXAF: 20, priceUSD: 0.04, description: 'Appel API integration' },
  { resource: 'webhook', unit: '1K appels', priceXAF: 200, priceUSD: 0.40, description: 'Appels webhook' },
  { resource: 'mcp_query', unit: 'requete', priceXAF: 30, priceUSD: 0.06, description: 'Requete MCP Server' },
];

// ============================================================
// SERVICE PAYG
// ============================================================

class PaygService {
  calculateCost(resource: string, quantity: number = 1) {
    const rate = PAYG_RATES.find(r => r.resource === resource);
    if (!rate) return { xaf: 0, usd: 0, rate: null };
    return { xaf: rate.priceXAF * quantity, usd: rate.priceUSD * quantity, rate };
  }

  async recordUsage(params: { userId: string; resource: string; quantity: number; description?: string; metadata?: Record<string, any> }) {
    const cost = this.calculateCost(params.resource, params.quantity);
    if (!cost.rate) return { success: false, costXAF: 0, balanceAfter: 0 };

    const balance = await this.getBalance(params.userId);
    if (balance < cost.xaf) {
      return { success: false, costXAF: cost.xaf, balanceAfter: balance, error: 'Solde insuffisant' };
    }

    const newBalance = balance - cost.xaf;
    await db.creditTransaction.create({
      data: {
        userId: params.userId,
        amount: -cost.xaf,
        balance: Math.max(0, newBalance),
        type: 'usage',
        resourceType: 'agent_run',
        description: params.description || `PAYG: ${params.quantity}x ${cost.rate.description}`,
        metadata: JSON.stringify({ payg: true, resource: params.resource, quantity: params.quantity, unitPriceXAF: cost.rate.priceXAF, totalXAF: cost.xaf, totalUSD: cost.usd, ...params.metadata }),
      },
    });

    return { success: true, costXAF: cost.xaf, balanceAfter: newBalance };
  }

  async getBalance(userId: string): Promise<number> {
    const last = await db.creditTransaction.findFirst({
      where: [{ field: 'userId', op: '==', value: userId }],
      orderBy: [{ field: 'createdAt', direction: 'desc' }],
      select: ['balance'],
    });
    return (last?.balance as number) ?? 0;
  }

  async getUsageSummary(userId: string) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const txs = await db.creditTransaction.findMany({
      where: [
        { field: 'userId', op: '==', value: userId },
        { field: 'type', op: '==', value: 'usage' },
        { field: 'createdAt', op: '>=', value: monthStart },
      ],
      orderBy: [{ field: 'createdAt', direction: 'desc' }],
    });

    let todayTotal = 0, todayCount = 0, monthTotal = 0, monthCount = 0;
    const byResource: Record<string, { count: number; totalXAF: number }> = {};

    for (const tx of txs) {
      const amt = Math.abs(tx.amount as number);
      monthTotal += amt; monthCount++;
      if ((tx.createdAt as Date) >= today) { todayTotal += amt; todayCount++; }
      try {
        const meta = JSON.parse((tx.metadata as string) || '{}');
        const r = meta?.resource || tx.resourceType || 'general';
        if (!byResource[r]) byResource[r] = { count: 0, totalXAF: 0 };
        byResource[r].count++; byResource[r].totalXAF += amt;
      } catch {}
    }

    const balance = await this.getBalance(userId);
    const alerts = [];
// @ts-ignore
    if (balance < 1000) alerts.push('Solde faible (< 1 000 FCFA)');
// @ts-ignore
    if (monthTotal > 5000) alerts.push(`Consommation mensuelle: ${monthTotal} FCFA`);
// @ts-ignore
    if (monthTotal > 10000) alerts.push('Alerte: plus de 10 000 FCFA ce mois');

    return { today: { totalXAF: todayTotal, count: todayCount }, thisMonth: { totalXAF: monthTotal, totalUSD: +(monthTotal / 500).toFixed(2), count: monthCount }, byResource, balanceXAF: balance, alerts };
  }

  async topUp(params: { userId: string; amountXAF: number; phone: string; operator: string }) {
    if (params.amountXAF < 500) return { success: false, message: 'Minimum: 500 FCFA' };
    if (params.amountXAF > 500000) return { success: false, message: 'Maximum: 500 000 FCFA' };

    const ref = `gen3ia_topup_${params.userId.slice(0, 8)}_${Date.now()}`;
    const payment = await sebpay.initiatePayment({
      amount: params.amountXAF, currency: 'XAF', phone: params.phone,
      operator: params.operator, description: `Recharge PAYG ${params.amountXAF} FCFA`,
      reference: ref,
      callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/payments/webhook`,
    });

    if (!payment.success) return { success: false, message: payment.message || 'Erreur paiement' };
    return { success: true, transactionId: payment.transactionId, message: 'Paiement initie' };
  }

  async creditAfterPayment(userId: string, amountXAF: number, transactionId: string) {
    await addCredits({ userId, amount: amountXAF, type: 'purchase', resourceType: 'credit_purchase', description: `Recharge PAYG: ${amountXAF} FCFA`, metadata: { payg: true, transactionId } });
    log.info('payg_credited', { userId: userId.slice(0, 8), amountXAF });
  }
}

export const paygService = new PaygService();
export default paygService;
