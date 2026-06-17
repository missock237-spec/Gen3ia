/**
 * Credit System — AI Usage Credit Tracking & Management
 *
 * Track AI usage credits (tokens, images, videos, voice).
 * Credit packages: free (100), pro (5000), enterprise (unlimited).
 */

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';

const log = createLogger('credits');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreditType = 'purchase' | 'usage' | 'refund' | 'bonus' | 'adjustment';
export type ResourceType =
  | 'chat_live'
  | 'chat_search'
  | 'image_gen'
  | 'video_sec'
  | 'audio_sec'
  | 'whatsapp_sms'
  | 'whatsapp_call_min'
  | 'whatsapp_voice_msg'
  | 'post_text'
  | 'post_video_min'
  | 'agent_run'
  | 'token'
  | 'credit_purchase'
  | 'plan_upgrade'
  | 'report_gen'
  | 'video_gen'
  | 'voice';

export interface CreditCheckResult {
  hasCredits: boolean;
  balance: number;
  required: number;
  shortfall?: number;
}

export interface DeductCreditsInput {
  userId: string;
  amount: number;
  resourceType: ResourceType;
  resourceId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface AddCreditsInput {
  userId: string;
  amount: number;
  type: CreditType;
  resourceType: ResourceType;
  resourceId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface UsageHistoryEntry {
  id: string;
  amount: number;
  balance: number;
  type: string;
  resourceType: string;
  description: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Credit Costs per Resource Type
// ---------------------------------------------------------------------------

export const CREDIT_COSTS: Record<ResourceType, number> = {
  chat_live: 2,             // 2 crédits par message
  chat_search: 5,           // 5 crédits par message avec recherche
  image_gen: 10,            // 10 crédits par image
  video_sec: 5,             // 5 crédits par seconde de vidéo
  audio_sec: 0.33,          // 0.33 crédit par seconde de voix off
  whatsapp_sms: 10,         // 10 crédits par SMS
  whatsapp_call_min: 100,   // 100 crédits par minute d'appel
  whatsapp_voice_msg: 25,   // 25 crédits par message vocal généré
  post_text: 50,            // 50 crédits par post texte
  post_video_min: 200,      // 200 crédits par vidéo 1 minute
  agent_run: 5,
  token: 1,
  credit_purchase: 0,
  plan_upgrade: 0,
  report_gen: 2,
  video_gen: 50,
  voice: 3,
};

// ---------------------------------------------------------------------------
// Core Methods
// ---------------------------------------------------------------------------

/**
 * Check if user has enough credits
 */
export async function checkCredits(
  userId: string,
  requiredCredits: number
): Promise<CreditCheckResult> {
  const balance = await getCreditBalance(userId);

  if (balance === -1) {
    // Unlimited credits
    return { hasCredits: true, balance: -1, required: requiredCredits };
  }

  const hasCredits = balance >= requiredCredits;
  return {
    hasCredits,
    balance,
    required: requiredCredits,
    shortfall: hasCredits ? undefined : requiredCredits - balance,
  };
}

/**
 * Deduct credits from user's balance
 */
export async function deductCredits(input: DeductCreditsInput): Promise<{
  success: boolean;
  newBalance: number;
  transactionId: string;
}> {
  const balance = await getCreditBalance(input.userId);

  // Unlimited credits — always succeed
  if (balance === -1) {
    const transaction = await db.creditTransaction.create({
      data: {
        userId: input.userId,
        amount: -input.amount,
        balance: -1,
        type: 'usage',
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        description: input.description || `Used ${input.amount} credits for ${input.resourceType}`,
        metadata: JSON.stringify(input.metadata || {}),
      },
    });

    return { success: true, newBalance: -1, transactionId: transaction.id };
  }

  // Check if enough credits
  if (balance < input.amount) {
    log.warn('Insufficient credits', {
      userId: input.userId,
      balance,
      required: input.amount,
      resourceType: input.resourceType,
    });

    return { success: false, newBalance: balance, transactionId: '' };
  }

  const newBalance = balance - input.amount;

  const transaction = await db.creditTransaction.create({
    data: {
      userId: input.userId,
      amount: -input.amount,
      balance: newBalance,
      type: 'usage',
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      description: input.description || `Used ${input.amount} credits for ${input.resourceType}`,
      metadata: JSON.stringify(input.metadata || {}),
    },
  });

  log.info('Credits deducted', {
    userId: input.userId,
    amount: input.amount,
    newBalance,
    resourceType: input.resourceType,
  });

  return { success: true, newBalance, transactionId: transaction.id };
}

/**
 * Add credits to user's balance
 */
export async function addCredits(input: AddCreditsInput): Promise<{
  newBalance: number;
  transactionId: string;
}> {
  const currentBalance = await getCreditBalance(input.userId);
  const newBalance = currentBalance === -1 ? -1 : currentBalance + input.amount;

  const transaction = await db.creditTransaction.create({
    data: {
      userId: input.userId,
      amount: input.amount,
      balance: newBalance,
      type: input.type,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      description: input.description || `Added ${input.amount} credits (${input.type})`,
      metadata: JSON.stringify(input.metadata || {}),
    },
  });

  log.info('Credits added', {
    userId: input.userId,
    amount: input.amount,
    newBalance,
    type: input.type,
  });

  return { newBalance, transactionId: transaction.id };
}

/**
 * Get current credit balance for a user
 * Returns -1 for unlimited plans
 */
export async function getCreditBalance(userId: string): Promise<number> {
  // Check subscription for unlimited plans
  const subscription = await db.subscription.findFirst({
    where: { userId, status: 'active' },
    select: { plan: true },
  });

  if (subscription?.plan === 'enterprise') {
    return -1; // Unlimited
  }

  // Get the latest transaction balance
  const latestTransaction = await db.creditTransaction.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { balance: true },
  });

  return latestTransaction?.balance ?? 0;
}

/**
 * Get usage history for a user
 */
export async function getUsageHistory(
  userId: string,
  options?: {
    type?: CreditType;
    resourceType?: ResourceType;
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
  }
): Promise<{
  entries: UsageHistoryEntry[];
  total: number;
}> {
  const where: Record<string, unknown> = { userId };

  if (options?.type) where.type = options.type;
  if (options?.resourceType) where.resourceType = options.resourceType;
  if (options?.startDate || options?.endDate) {
    where.createdAt = {
      ...(options.startDate ? { gte: options.startDate } : {}),
      ...(options.endDate ? { lte: options.endDate } : {}),
    };
  }

  const [entries, total] = await Promise.all([
    db.creditTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit || 50,
      skip: options?.offset || 0,
    }),
    db.creditTransaction.count({ where }),
  ]);

  return {
    entries: entries.map((e) => ({
      id: e.id,
      amount: e.amount,
      balance: e.balance,
      type: e.type,
      resourceType: e.resourceType,
      description: e.description,
      createdAt: e.createdAt.toISOString(),
    })),
    total,
  };
}

/**
 * Initialize credits for a new user (free plan)
 */
export async function initializeUserCredits(userId: string): Promise<void> {
  const existing = await db.creditTransaction.findFirst({
    where: { userId },
  });

  if (existing) return; // Already initialized

  await addCredits({
    userId,
    amount: 500, // Free tier: 500 credits
    type: 'bonus',
    resourceType: 'plan_upgrade',
    description: 'Welcome bonus: 500 free credits',
    metadata: { plan: 'free' },
  });

  log.info('User credits initialized', { userId });
}

/**
 * Calculate credits for a specific action
 */
export function calculateCredits(action: ResourceType, params: Record<string, any> = {}): number {
  const baseCost = CREDIT_COSTS[action] || 0;

  switch (action) {
    case 'video_sec':
      return baseCost * (params.durationSeconds || 0);
    case 'audio_sec':
      return baseCost * (params.durationSeconds || 0);
    case 'whatsapp_call_min':
      return baseCost * (params.durationMinutes || 1);
    case 'post_video_min':
      return baseCost * (params.durationMinutes || 1);
    default:
      return baseCost;
  }
}

/**
 * Purchase credits package
 */
export async function purchaseCredits(
  userId: string,
  packageId: string
): Promise<{
  checkoutUrl: string;
  sessionId: string;
}> {
  const { CREDIT_PACKAGES } = await import('./plans');
  const pkg = CREDIT_PACKAGES.find((p) => p.id === packageId);

  if (!pkg) {
    throw new Error(`Invalid credit package: ${packageId}`);
  }

  // Create a Neero checkout session for one-time payment
  const { createCheckoutSession } = await import('./neero-client');

  const result = await createCheckoutSession({
    userId,
    priceId: pkg.neeroPriceId,
    planId: 'credit_purchase',
    mode: 'payment',
  });

  // Store the credit amount in the session metadata (handled by neero-client)
  log.info('Credit purchase initiated', {
    userId,
    packageId,
    credits: pkg.credits,
    price: pkg.price,
  });

  return {
    checkoutUrl: result.url,
    sessionId: result.sessionId,
  };
}
