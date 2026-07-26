import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { createHmac, randomBytes } from 'crypto';

const log = createLogger('webhook-delivery');

interface WebhookDelivery {
  id: string;
  url: string;
  secret: string;
  event: string;
  payload: Record<string, unknown>;
  headers: Record<string, string>;
  retryConfig: { maxRetries: number; backoffMs: number };
  timeoutMs: number;
}

interface DeliveryResult {
  success: boolean;
  statusCode?: number;
  durationMs: number;
  attempt: number;
  error?: string;
  responseBody?: string;
}

const DELIVERY_QUEUE: Array<{ delivery: WebhookDelivery; resolve: (r: DeliveryResult) => void }> = [];
let isProcessing = false;

function generateDeliveryId(): string {
  return `del_${Date.now()}_${randomBytes(4).toString('hex')}`;
}

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

async function attemptDelivery(
  delivery: WebhookDelivery,
  attempt: number
): Promise<DeliveryResult> {
  const startTime = Date.now();
  const payloadStr = JSON.stringify(delivery.payload);
  const deliveryId = generateDeliveryId();
  const signature = signPayload(payloadStr, delivery.secret);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), delivery.timeoutMs);

  try {
    const res = await fetch(delivery.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Genova-Signature': signature,
        'X-Genova-Event': delivery.event,
        'X-Genova-Delivery': deliveryId,
        'X-Genova-Attempt': String(attempt),
        'User-Agent': 'Genova-Webhook/1.0',
        ...delivery.headers,
      },
      body: payloadStr,
      signal: controller.signal,
    });

    clearTimeout(timer);
    const durationMs = Date.now() - startTime;
    const responseBody = await res.text().catch(() => '');

    return {
      success: res.ok,
      statusCode: res.status,
      durationMs,
      attempt,
      responseBody: responseBody.slice(0, 500),
    };
  } catch (error) {
    clearTimeout(timer);
    return {
      success: false,
      durationMs: Date.now() - startTime,
      attempt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function processQueue(): Promise<void> {
  if (isProcessing || DELIVERY_QUEUE.length === 0) return;
  isProcessing = true;

  while (DELIVERY_QUEUE.length > 0) {
    const item = DELIVERY_QUEUE.shift();
    if (!item) continue;

    const { delivery, resolve } = item;
    const { retryConfig } = delivery;
    const maxAttempts = retryConfig.maxRetries + 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const result = await attemptDelivery(delivery, attempt);

      await db.$executeRawUnsafe(`
        INSERT INTO webhook_logs (id, webhook_url, event, attempt, status_code, duration_ms, success, error_message, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      `, [
        generateDeliveryId(),
        delivery.url,
        delivery.event,
        attempt,
        result.statusCode || null,
        result.durationMs,
        result.success,
        result.error || null,
      ]).catch(err => {
        log.warn('Failed to log webhook delivery', { error: err instanceof Error ? err.message : String(err) });
      });

      if (result.success) {
        log.info('Webhook delivered successfully', {
          event: delivery.event,
          url: delivery.url.slice(0, 50),
          attempt,
          durationMs: result.durationMs,
        });
        resolve(result);
        break;
      }

      if (attempt < maxAttempts) {
        const backoff = retryConfig.backoffMs * Math.pow(2, attempt - 1);
        log.warn('Webhook delivery failed, retrying', {
          event: delivery.event,
          attempt,
          maxAttempts,
          nextRetryMs: backoff,
          error: result.error,
        });
        await new Promise(r => setTimeout(r, backoff));
      } else {
        log.error('Webhook delivery failed permanently', {
          event: delivery.event,
          url: delivery.url.slice(0, 50),
          attempts: attempt,
          error: result.error,
        });
        resolve(result);
      }
    }
  }

  isProcessing = false;
}

export async function deliverWebhook(
  url: string,
  event: string,
  payload: Record<string, unknown>,
  options?: {
    secret?: string;
    headers?: Record<string, string>;
    retryConfig?: { maxRetries: number; backoffMs: number };
    timeoutMs?: number;
  }
): Promise<DeliveryResult> {
  const delivery: WebhookDelivery = {
    id: generateDeliveryId(),
    url,
    secret: options?.secret || '',
    event,
    payload,
    headers: options?.headers || {},
    retryConfig: options?.retryConfig || { maxRetries: 3, backoffMs: 1000 },
    timeoutMs: options?.timeoutMs || 10000,
  };

  return new Promise((resolve) => {
    DELIVERY_QUEUE.push({ delivery, resolve });
    processQueue();
  });
}

export async function deliverToAllSubscribers(
  event: string,
  payload: Record<string, unknown>
): Promise<DeliveryResult[]> {
  try {
    const webhooks = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT url, secret, events, headers, retry_config as "retryConfig", timeout_ms as "timeoutMs"
      FROM webhook_endpoints
      WHERE is_active = true AND (events::jsonb ? $1 OR events::jsonb ? '*')
    `, [event]);

    if (!webhooks || webhooks.length === 0) {
      log.info('No webhook subscribers for event', { event });
      return [];
    }

    log.info('Delivering webhook event to subscribers', { event, subscriberCount: webhooks.length });

    const results = await Promise.allSettled(
      webhooks.map(wh =>
        deliverWebhook(
          wh.url as string,
          event,
          payload,
          {
            secret: wh.secret as string,
            headers: JSON.parse((wh.headers as string) || '{}'),
            retryConfig: JSON.parse((wh.retry_config as string) || '{}'),
            timeoutMs: (wh.timeout_ms as number) || 10000,
          }
        )
      )
    );

    return results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      return {
        success: false,
        durationMs: 0,
        attempt: 1,
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        webhookIndex: i,
      } as DeliveryResult & { webhookIndex: number };
    });
  } catch (error) {
    log.error('Failed to deliver webhooks', { event, error: error instanceof Error ? error.message : String(error) });
    return [];
  }
}
