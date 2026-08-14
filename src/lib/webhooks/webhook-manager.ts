/**
 * Webhook Manager — Manages webhook dispatching and delivery
 */

import { prisma } from '@/lib/prisma';
import { createLogger } from '@/lib/logger';

const log = createLogger('webhook-manager');

class WebhookManager {
  async emit(eventType: string, userId: string, payload: any) {
    try {
      const configs = await prisma.webhookConfig.findMany({
        where: { userId, enabled: true },
      });

      const results = await Promise.allSettled(
        configs.map(async (config) => {
          try {
            const response = await fetch(config.url, {
              method: config.method || 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(config.headers ? JSON.parse(config.headers) : {}),
              },
              body: JSON.stringify(payload),
              signal: AbortSignal.timeout(config.timeout || 10000),
            });

            await prisma.webhookLog.create({
              data: {
                configId: config.id,
                status: response.ok ? 'success' : 'failed',
                statusCode: response.status,
                durationMs: 0,
                responseBody: await response.text().catch(() => ''),
                metadata: JSON.stringify(payload),
              },
            });

            return response.ok;
          } catch (err) {
            log.error('Webhook delivery failed', {
              configId: config.id,
              error: err instanceof Error ? err.message : String(err),
            });
            return false;
          }
        })
      );

      return results;
    } catch (err) {
      log.error('Webhook emit error', { error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  }
}

export const webhookManager = new WebhookManager();
