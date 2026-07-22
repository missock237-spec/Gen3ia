// ============================================================
// PAYMENT RETRY — Système de rattrapage intelligent
// ============================================================

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export interface PaymentRetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_CONFIG: PaymentRetryConfig = {
  maxRetries: 5,
  baseDelayMs: 60_000, // 1 minute
  backoffMultiplier: 2, // Exponentiel: 1min, 2min, 4min, 8min, 16min
};

export async function scheduleRetry(
  userId: string,
  amount: number,
  metadata: Record<string, unknown>,
  config: Partial<PaymentRetryConfig> = {}
): Promise<void> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  await prisma.creditTransaction.create({
    data: {
      userId,
      amount: 0,
      balance: 0,
      type: "payment_retry",
      description: `Paiement de ${amount}€ planifié (max ${cfg.maxRetries} tentatives)`,
      metadata: JSON.stringify({
        retryCount: 0,
        maxRetries: cfg.maxRetries,
        amount,
        originalMetadata: metadata,
        nextRetryAt: new Date(Date.now() + cfg.baseDelayMs).toISOString(),
      }),
      resourceType: "payment_retry",
    },
  });

  logger.info("payment_retry_scheduled", {
    userId,
    amount,
    maxRetries: cfg.maxRetries,
    nextRetryIn: `${cfg.baseDelayMs}ms`,
  });
}

export async function processPendingRetries(): Promise<number> {
  const pending = await prisma.creditTransaction.findMany({
    where: {
      type: "payment_retry",
      description: { contains: "planifié" },
    },
  });

  let processedCount = 0;

  for (const entry of pending) {
    try {
      const metadata = JSON.parse(entry.metadata ?? "{}");
      const nextRetryAt = new Date(metadata.nextRetryAt);

      if (nextRetryAt > new Date()) continue;

      logger.info("payment_retry_processing", { userId: entry.userId, retryCount: metadata.retryCount });

      // TODO: Appeler le provider de paiement ici
      // const result = await paymentProvider.charge(metadata.amount, metadata.originalMetadata);

      const newRetryCount = (metadata.retryCount ?? 0) + 1;

      if (newRetryCount >= metadata.maxRetries) {
        await prisma.creditTransaction.update({
          where: { id: entry.id },
          data: {
            description: `Paiement échoué après ${newRetryCount} tentatives`,
            metadata: JSON.stringify({ ...metadata, finalStatus: "failed" }),
          },
        });
        logger.warn("payment_retry_max_reached", { userId: entry.userId, retries: newRetryCount });
      } else {
        const nextDelay = DEFAULT_CONFIG.baseDelayMs * Math.pow(DEFAULT_CONFIG.backoffMultiplier, newRetryCount);
        await prisma.creditTransaction.update({
          where: { id: entry.id },
          data: {
            metadata: JSON.stringify({
              ...metadata,
              retryCount: newRetryCount,
              lastAttemptAt: new Date().toISOString(),
              nextRetryAt: new Date(Date.now() + nextDelay).toISOString(),
            }),
          },
        });
      }

      processedCount++;
    } catch (error) {
      logger.error("payment_retry_error", { entryId: entry.id, error: String(error) });
    }
  }

  return processedCount;
}