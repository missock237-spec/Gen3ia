// ============================================================
// CREDIT ENGINE — Système de déduction de crédits basé sur
// l'effort des tâches et le coût réel des fournisseurs IA
// ============================================================

import { db } from '@/lib/db';
import { getAdminDb } from '@/lib/firebase/admin';
import type { TransactionContext } from '@/lib/firebase/firestore';
import { createLogger } from '@/lib/logger';

const log = createLogger('credit-engine');

// ============================================================
// Types
// ============================================================

export type TaskCategory = 
  | 'chat' | 'analysis' | 'reasoning' | 'code' | 'image_generation'
  | 'video_generation' | 'audio_generation' | 'voice_call'
  | 'browser_automation' | 'web_search' | 'tool_execution'
  | 'memory_operation' | 'workflow' | 'agent_orchestration';

export type ProviderName = 
  | 'openai' | 'anthropic' | 'groq' | 'openrouter'
  | 'deepgram' | 'elevenlabs' | 'twilio' | 'huggingface'
  | 'replicate' | 'stability' | 'cogvideo';

export interface CreditCost {
  credits: number;
  usdCost: number;
  breakdown: CreditBreakdownItem[];
}

export interface CreditBreakdownItem {
  component: string;
  credits: number;
  usd: number;
  description: string;
}

export interface DeductionResult {
  success: boolean;
  transactionId?: string;
  balanceBefore: number;
  balanceAfter: number;
  deducted: number;
  reason: string;
}

// ============================================================
// Tarifs des fournisseurs (USD par unité)
// Mis à jour en temps réel via l'API
// ============================================================

export const PROVIDER_PRICING: Record<string, {
  inputPer1K: number;
  outputPer1K: number;
  currency: string;
}> = {
  'openai/gpt-4o':          { inputPer1K: 0.0025,  outputPer1K: 0.010,  currency: 'USD' },
  'openai/gpt-4o-mini':     { inputPer1K: 0.00015, outputPer1K: 0.0006, currency: 'USD' },
  'openai/o1':              { inputPer1K: 0.015,   outputPer1K: 0.060,  currency: 'USD' },
  'openai/o3-mini':         { inputPer1K: 0.0011,  outputPer1K: 0.0044, currency: 'USD' },
  'anthropic/claude-3.5-sonnet': { inputPer1K: 0.003, outputPer1K: 0.015, currency: 'USD' },
  'anthropic/claude-3-haiku':    { inputPer1K: 0.00025, outputPer1K: 0.00125, currency: 'USD' },
  'anthropic/claude-4-sonnet':   { inputPer1K: 0.015, outputPer1K: 0.075, currency: 'USD' },
  'groq/llama-3.3-70b':     { inputPer1K: 0.00059, outputPer1K: 0.00079, currency: 'USD' },
  'groq/llama-3.1-8b':      { inputPer1K: 0.00005, outputPer1K: 0.00008, currency: 'USD' },
  'groq/mixtral-8x7b':      { inputPer1K: 0.00024, outputPer1K: 0.00024, currency: 'USD' },
  'deepgram/nova-2':        { inputPer1K: 0.0,     outputPer1K: 0.0043,  currency: 'USD' }, // par minute audio
  'elevenlabs/multilingual': { inputPer1K: 0.0,    outputPer1K: 0.03,    currency: 'USD' }, // par 1K car
  'twilio/voice':           { inputPer1K: 0.0,     outputPer1K: 0.013,   currency: 'USD' }, // par minute
  'huggingface/inference':  { inputPer1K: 0.0,     outputPer1K: 0.0001,  currency: 'USD' },
  'replicate/run':          { inputPer1K: 0.0,     outputPer1K: 0.00025, currency: 'USD' }, // par seconde
};

// ============================================================
// Facteurs d'effort par catégorie de tâche
// ============================================================

export const TASK_EFFORT_MULTIPLIER: Record<TaskCategory, number> = {
  'chat':                1.0,
  'analysis':            2.5,
  'reasoning':           3.0,
  'code':                2.0,
  'image_generation':    5.0,
  'video_generation':    20.0,
  'audio_generation':    3.0,
  'voice_call':          8.0,
  'browser_automation':  4.0,
  'web_search':          0.5,
  'tool_execution':      1.5,
  'memory_operation':    0.3,
  'workflow':            6.0,
  'agent_orchestration': 10.0,
};

// ============================================================
// Taux de conversion crédits
// 1 crédit = 0.001 USD (1 crédit = 1 millième de centime)
// ============================================================

const CREDIT_PER_USD = 1000;

export function usdToCredits(usd: number): number {
  return Math.ceil(usd * CREDIT_PER_USD);
}

export function creditsToUsd(credits: number): number {
  return credits / CREDIT_PER_USD;
}

// ============================================================
// Credit Engine
// ============================================================

export class CreditEngine {
  /**
   * Calcule le coût exact d'une requête LLM
   */
  calculateLlmCost(
    provider: string,
    model: string,
    promptTokens: number,
    completionTokens: number
  ): { usd: number; credits: number } {
    const key = `${provider}/${model}`;
    const pricing = PROVIDER_PRICING[key];

    if (!pricing) {
      const fallbackPricing = this.getFallbackPricing(provider);
      const usd = (promptTokens / 1000) * fallbackPricing.inputPer1K +
                  (completionTokens / 1000) * fallbackPricing.outputPer1K;
      return { usd, credits: usdToCredits(usd) };
    }

    const usd = (promptTokens / 1000) * pricing.inputPer1K +
                (completionTokens / 1000) * pricing.outputPer1K;
    return { usd, credits: usdToCredits(usd) };
  }

  /**
   * Calcule le coût basé sur la catégorie de tâche
   */
  calculateTaskCost(
    category: TaskCategory,
    effortFactors?: {
      tokensUsed?: number;
      durationMs?: number;
      toolCalls?: number;
      provider?: string;
      model?: string;
    }
  ): CreditCost {
    const multiplier = TASK_EFFORT_MULTIPLIER[category] || 1.0;
    const breakdown: CreditBreakdownItem[] = [];
    let totalUsd = 0;

    // Coût de base de la tâche
    const baseCost = 0.0001 * multiplier;
    breakdown.push({
      component: 'base_task',
      credits: usdToCredits(baseCost),
      usd: baseCost,
      description: `Coût de base pour ${category} (x${multiplier})`,
    });
    totalUsd += baseCost;

    // Coût des tokens LLM
    if (effortFactors?.tokensUsed && effortFactors?.provider) {
      const llmCost = this.calculateLlmCost(
        effortFactors.provider,
        effortFactors.model || 'default',
        Math.floor(effortFactors.tokensUsed * 0.75),
        Math.floor(effortFactors.tokensUsed * 0.25)
      );
      breakdown.push({
        component: 'llm_tokens',
        credits: llmCost.credits,
        usd: llmCost.usd,
        description: `${effortFactors.tokensUsed} tokens (${effortFactors.provider}/${effortFactors.model || 'default'})`,
      });
      totalUsd += llmCost.usd;
    }

    // Coût de durée (appels vocaux, automations)
    if (effortFactors?.durationMs) {
      const durationMinutes = effortFactors.durationMs / 60000;
      const durationCost = durationMinutes * 0.002 * multiplier;
      breakdown.push({
        component: 'duration',
        credits: usdToCredits(durationCost),
        usd: durationCost,
        description: `${Math.round(durationMinutes * 100) / 100} min d'exécution`,
      });
      totalUsd += durationCost;
    }

    // Coût des outils appelés
    if (effortFactors?.toolCalls) {
      const toolCost = effortFactors.toolCalls * 0.0005;
      breakdown.push({
        component: 'tool_calls',
        credits: usdToCredits(toolCost),
        usd: toolCost,
        description: `${effortFactors.toolCalls} outils exécutés`,
      });
      totalUsd += toolCost;
    }

    return {
      credits: usdToCredits(totalUsd),
      usdCost: totalUsd,
      breakdown,
    };
  }

  /**
   * Calcule le coût d'un appel vocal
   */
  calculateVoiceCallCost(durationSeconds: number, provider: string): CreditCost {
    const durationMinutes = durationSeconds / 60;
    let totalUsd = 0;
    const breakdown: CreditBreakdownItem[] = [];

    // Coût Twilio
    const twilioCost = durationMinutes * 0.013;
    breakdown.push({
      component: 'telephony',
      credits: usdToCredits(twilioCost),
      usd: twilioCost,
      description: `${Math.round(durationMinutes * 100) / 100} min d\'appel (${provider})`,
    });
    totalUsd += twilioCost;

    // STT (Deepgram)
    const sttCost = durationMinutes * 0.0043;
    breakdown.push({
      component: 'stt',
      credits: usdToCredits(sttCost),
      usd: sttCost,
      description: 'Transcription parole → texte',
    });
    totalUsd += sttCost;

    // TTS (ElevenLabs)
    const avgCharsPerMinute = 900;
    const estimatedChars = avgCharsPerMinute * durationMinutes;
    const ttsCost = (estimatedChars / 1000) * 0.03;
    breakdown.push({
      component: 'tts',
      credits: usdToCredits(ttsCost),
      usd: ttsCost,
      description: 'Synthèse texte → parole',
    });
    totalUsd += ttsCost;

    return {
      credits: usdToCredits(totalUsd),
      usdCost: totalUsd,
      breakdown,
    };
  }

  /**
   * Calcule le coût de génération d'image/vidéo
   */
  calculateMediaCost(
    type: 'image' | 'video',
    provider: string,
    model: string,
    parameters?: { width?: number; height?: number; steps?: number; frames?: number }
  ): CreditCost {
    const breakdown: CreditBreakdownItem[] = [];
    let totalUsd = 0;

    if (type === 'image') {
      const baseImageCost = 0.002;
      const resolutionMultiplier = parameters?.width && parameters?.height
        ? (parameters.width * parameters.height) / (1024 * 1024)
        : 1.0;
      const finalCost = baseImageCost * resolutionMultiplier;
      breakdown.push({
        component: 'image_generation',
        credits: usdToCredits(finalCost),
        usd: finalCost,
        description: `Image ${parameters?.width || 1024}x${parameters?.height || 1024} (${provider}/${model})`,
      });
      totalUsd = finalCost;
    } else {
      const frames = parameters?.frames || 25;
      const baseVideoCost = 0.01 * (frames / 25);
      breakdown.push({
        component: 'video_generation',
        credits: usdToCredits(baseVideoCost),
        usd: baseVideoCost,
        description: `Vidéo ${frames} frames (${provider}/${model})`,
      });
      totalUsd = baseVideoCost;
    }

    return {
      credits: usdToCredits(totalUsd),
      usdCost: totalUsd,
      breakdown,
    };
  }

  /**
   * Exécute la déduction de crédits
   */
  async deductCredits(
    userId: string,
    cost: CreditCost,
    metadata: {
      action: string;
      category: TaskCategory;
      agentId?: string;
      resourceId?: string;
      provider?: string;
      model?: string;
    }
  ): Promise<DeductionResult> {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });

    if (!user) {
      return {
        success: false,
        balanceBefore: 0,
        balanceAfter: 0,
        deducted: 0,
        reason: 'Utilisateur introuvable',
      };
    }

    const freePlanLimits = this.getFreePlanLimits();

    // ============================================================
    // DÉDUCTION ATOMIQUE — utilise Firestore.runTransaction pour
    // éliminer la race condition TOCTOU (check-then-act).
    // Lecture + écriture du solde + création de transaction
    // se font dans une seule transaction ACID.
    // ============================================================
    const adminDb = getAdminDb();

    const result = await adminDb.runTransaction(async (tx) => {
      // 1. Lire la dernière transaction pour obtenir le solde actuel
      const lastTxSnap = await tx.get(
        adminDb.collection('credit_transactions')
          .where('userId', '==', userId)
          .orderBy('createdAt', 'desc')
          .limit(1)
      );

      let balance: number;
      if (!lastTxSnap.empty) {
        const lastTxData = lastTxSnap.docs[0].data();
        balance = Math.floor(lastTxData.balance ?? 0);
      } else {
        const initialCredits: Record<string, number> = {
          free: 1000, starter: 5000, pro: 50000, enterprise: 500000,
        };
        balance = initialCredits[user.plan || 'free'] || 1000;
      }

      // 2. Vérifier les limites (check atomique — aucune fenêtre TOCTOU)
      if (user.plan === 'free' && balance < cost.credits) {
        // Vérifier l'usage quotidien dans la même transaction
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todaySnap = await tx.get(
          adminDb.collection('credit_transactions')
            .where('userId', '==', userId)
            .where('type', '==', 'debit')
            .where('createdAt', '>=', today)
        );
        const todayUsage = todaySnap.docs.reduce((sum, doc) => {
          const data = doc.data();
          return sum + Math.abs(data.amount ?? 0);
        }, 0);

        if (todayUsage >= freePlanLimits.dailyCredits) {
          return {
            success: false as const,
            balanceBefore: balance,
            balanceAfter: balance,
            deducted: 0,
            reason: `Limite quotidienne du plan gratuit atteinte (${freePlanLimits.dailyCredits} crédits/jour)`,
          };
        }
      }

      if (balance < cost.credits && user.plan !== 'free') {
        return {
          success: false as const,
          balanceBefore: balance,
          balanceAfter: balance,
          deducted: 0,
          reason: `Crédits insuffisants. Solde: ${balance}, requis: ${cost.credits}`,
        };
      }

      // 3. Calculer la déduction réelle
      const actualDeduction = Math.min(
        cost.credits,
        balance + (user.plan === 'free' ? freePlanLimits.overdraft : 0)
      );
      const newBalance = Math.max(0, balance - actualDeduction);

      // 4. Créer la transaction de débit (atomique avec le check ci-dessus)
      const newTxRef = adminDb.collection('credit_transactions').doc();
      tx.set(newTxRef, {
        userId,
        amount: -actualDeduction,
        balance: newBalance,
        type: 'debit',
        resourceType: metadata.action,
        resourceId: metadata.resourceId || null,
        description: this.buildDescription(cost, metadata),
        metadata: JSON.stringify({
          category: metadata.category,
          agentId: metadata.agentId,
          provider: metadata.provider,
          model: metadata.model,
          breakdown: cost.breakdown,
          usdCost: cost.usdCost,
        }),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return {
        success: true as const,
        transactionId: newTxRef.id,
        balanceBefore: balance,
        balanceAfter: newBalance,
        deducted: actualDeduction,
        reason: `${actualDeduction} crédits déduits pour ${metadata.action}`,
      };
    });

    if (result.success) {
      log.info('Credits deducted (atomic)', {
        userId: userId.slice(0, 8),
        deducted: result.deducted,
        balanceBefore: result.balanceBefore,
        balanceAfter: result.balanceAfter,
        action: metadata.action,
        usdCost: cost.usdCost,
      });
    }

    return result;
  }

  /**
   * Obtient le solde de crédits d'un utilisateur
   */
  async getUserBalance(userId: string): Promise<number> {
    const lastTransaction = await db.creditTransaction.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { balance: true },
    });

    if (lastTransaction) {
      return Math.floor(lastTransaction.balance);
    }

    // Pas de transaction, crédits par défaut selon le plan
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });

    const initialCredits: Record<string, number> = {
      free: 1000,
      starter: 5000,
      pro: 50000,
      enterprise: 500000,
    };

    return initialCredits[user?.plan || 'free'] || 1000;
  }

  /**
   * Calcule l'utilisation quotidienne pour les limites free
   */
  private async getTodayUsage(userId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await db.creditTransaction.aggregate({
      where: {
        userId,
        type: 'debit',
        createdAt: { gte: today },
      },
      _sum: { amount: true },
    });

// @ts-ignore
    return Math.abs(result._sum.amount || 0);
  }

  /**
   * Limites du plan gratuit
   */
  private getFreePlanLimits() {
    return {
      dailyCredits: 500,
      maxTokensPerDay: 50000,
      maxCallsPerDay: 10,
      overdraft: 200, // crédits de dépassement autorisés
    };
  }

  /**
   * Crédite un utilisateur (achat, bonus,充值)
   */
  async creditUser(
    userId: string,
    amount: number,
    reason: string,
    metadata?: Record<string, unknown>
  ): Promise<DeductionResult> {
    const balance = await this.getUserBalance(userId);
    const newBalance = balance + amount;

    await db.creditTransaction.create({
      data: {
        userId,
        amount,
        balance: newBalance,
        type: 'credit',
        resourceType: 'purchase',
        description: reason,
        metadata: JSON.stringify(metadata || {}),
      },
    });

    return {
      success: true,
      balanceBefore: balance,
      balanceAfter: newBalance,
      deducted: -amount,
      reason,
    };
  }

  /**
   * Construit la description de la transaction
   */
  private buildDescription(cost: CreditCost, metadata: {
    action: string;
    category: TaskCategory;
    provider?: string;
    model?: string;
  }): string {
    const parts: string[] = [metadata.action];
    if (metadata.provider) {
      parts.push(`via ${metadata.provider}`);
    }
    if (metadata.model) {
      parts.push(`(${metadata.model})`);
    }
    parts.push(`— ${cost.credits} crédits`);
    return parts.join(' ');
  }

  /**
   * Pricing de fallback pour les fournisseurs non listés
   */
  private getFallbackPricing(provider: string): { inputPer1K: number; outputPer1K: number } {
    const fallbacks: Record<string, { inputPer1K: number; outputPer1K: number }> = {
      openai: { inputPer1K: 0.003, outputPer1K: 0.012 },
      anthropic: { inputPer1K: 0.003, outputPer1K: 0.015 },
      groq: { inputPer1K: 0.0005, outputPer1K: 0.0007 },
      openrouter: { inputPer1K: 0.001, outputPer1K: 0.003 },
      huggingface: { inputPer1K: 0.0001, outputPer1K: 0.0001 },
      replicate: { inputPer1K: 0.0005, outputPer1K: 0.0005 },
    };
    return fallbacks[provider] || { inputPer1K: 0.001, outputPer1K: 0.002 };
  }
}

// ============================================================
// Singleton
// ============================================================

let instance: CreditEngine | null = null;

export function getCreditEngine(): CreditEngine {
  if (!instance) {
    instance = new CreditEngine();
  }
  return instance;
}
