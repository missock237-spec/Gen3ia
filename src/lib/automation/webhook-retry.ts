/**
 * Intelligent Webhook Retry System
 * 
 * Ensures webhook ingestion reliability:
 * - Exponential backoff retry (up to 24 hours)
 * - Dead letter queue for failed webhooks
 * - Webhook signature verification
 * - Replay functionality for manual retry
 * - Delivery tracking and analytics
 */

import { createLogger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import * as crypto from 'crypto';

const log = createLogger('webhook-retry');

export type WebhookStatus = 'pending' | 'processing' | 'success' | 'failed' | 'dead_lettered';

export interface WebhookEvent {
  id: string;
  endpoint: string;
  event: string;
  payload: Record<string, any>;
  signature: string;
  timestamp: Date;
  status: WebhookStatus;
  attemptCount: number;
  nextRetryAt?: Date;
  lastError?: string;
  lastAttemptAt?: Date;
  succeededAt?: Date;
}

export interface WebhookDeliveryMetrics {
  totalEvents: number;
  successCount: number;
  failedCount: number;
  deadLetteredCount: number;
  averageRetriesPerEvent: number;
  successRate: number;
}

class WebhookRetryEngine {
  private readonly MAX_RETRIES = 10;
  private readonly INITIAL_DELAY_MS = 1000; // 1 second
  private readonly MAX_DELAY_MS = 24 * 60 * 60 * 1000; // 24 hours
  private deadLetterQueue: WebhookEvent[] = [];
  private metrics = {
    totalEvents: 0,
    successCount: 0,
    failedCount: 0,
    deadLetteredCount: 0,
    totalRetries: 0,
  };

  constructor() {
    this.setupRetryScheduler();
  }

  /**
   * Generate HMAC signature for webhook
   */
  generateSignature(payload: Record<string, any>, secret: string): string {
    const json = JSON.stringify(payload);
    return crypto
      .createHmac('sha256', secret)
      .update(json)
      .digest('hex');
  }

  /**
   * Verify webhook signature
   */
  verifySignature(payload: Record<string, any>, signature: string, secret: string): boolean {
    const expectedSignature = this.generateSignature(payload, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    );
  }

  /**
   * Create webhook event for delivery
   */
  async createWebhookEvent(
    endpoint: string,
    event: string,
    payload: Record<string, any>,
    secret: string,
  ): Promise<WebhookEvent> {
    const signature = this.generateSignature(payload, secret);

    const webhookEvent: WebhookEvent = {
      id: `wh_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      endpoint,
      event,
      payload,
      signature,
      timestamp: new Date(),
      status: 'pending',
      attemptCount: 0,
    };

    this.metrics.totalEvents++;

    log.info('Webhook event created', {
      id: webhookEvent.id.slice(0, 8),
      event,
      endpoint: this.maskEndpoint(endpoint),
    });

    return webhookEvent;
  }

  /**
   * Attempt webhook delivery
   */
  async attemptDelivery(webhookEvent: WebhookEvent): Promise<boolean> {
    if (webhookEvent.status === 'dead_lettered') {
      return false;
    }

    if (webhookEvent.attemptCount >= this.MAX_RETRIES) {
      this.moveToDeadLetter(webhookEvent);
      return false;
    }

    webhookEvent.status = 'processing';
    webhookEvent.lastAttemptAt = new Date();
    webhookEvent.attemptCount++;

    try {
      const response = await fetch(webhookEvent.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': webhookEvent.signature,
          'X-Webhook-Event': webhookEvent.event,
          'X-Webhook-Timestamp': webhookEvent.timestamp.toISOString(),
        },
        body: JSON.stringify(webhookEvent.payload),
      });

      if (response.ok) {
        webhookEvent.status = 'success';
        webhookEvent.succeededAt = new Date();
        this.metrics.successCount++;

        log.info('Webhook delivered successfully', {
          id: webhookEvent.id.slice(0, 8),
          event: webhookEvent.event,
          attempts: webhookEvent.attemptCount,
        });

        return true;
      }

      // Transient error - retry
      if ([429, 503, 504].includes(response.status)) {
        webhookEvent.status = 'pending';
        webhookEvent.nextRetryAt = this.calculateNextRetry(webhookEvent.attemptCount);
        webhookEvent.lastError = `HTTP ${response.status}: ${response.statusText}`;

        log.warn('Webhook delivery failed (transient)', {
          id: webhookEvent.id.slice(0, 8),
          status: response.status,
          nextRetryAt: webhookEvent.nextRetryAt,
        });

        return false;
      }

      // Permanent error - dead letter
      webhookEvent.lastError = `HTTP ${response.status}: ${response.statusText}`;
      this.moveToDeadLetter(webhookEvent);

      return false;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      webhookEvent.lastError = errorMsg;

      // Transient errors - retry
      if (
        errorMsg.includes('ECONNREFUSED') ||
        errorMsg.includes('ETIMEDOUT') ||
        errorMsg.includes('socket hang up')
      ) {
        webhookEvent.status = 'pending';
        webhookEvent.nextRetryAt = this.calculateNextRetry(webhookEvent.attemptCount);

        log.warn('Webhook delivery failed (transient error)', {
          id: webhookEvent.id.slice(0, 8),
          error: errorMsg,
          nextRetryAt: webhookEvent.nextRetryAt,
        });

        return false;
      }

      // Permanent error
      this.moveToDeadLetter(webhookEvent);
      return false;
    }
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateNextRetry(attemptCount: number): Date {
    const delayMs = Math.min(
      this.INITIAL_DELAY_MS * Math.pow(2, attemptCount - 1),
      this.MAX_DELAY_MS,
    );

    // Add jitter (±10%)
    const jitter = delayMs * 0.1 * (Math.random() - 0.5) * 2;
    const totalDelay = Math.round(delayMs + jitter);

    return new Date(Date.now() + totalDelay);
  }

  /**
   * Move webhook to dead letter queue
   */
  private moveToDeadLetter(webhookEvent: WebhookEvent): void {
    webhookEvent.status = 'dead_lettered';
    this.deadLetterQueue.push(webhookEvent);
    this.metrics.deadLetteredCount++;

    log.error('Webhook moved to dead letter queue', {
      id: webhookEvent.id.slice(0, 8),
      event: webhookEvent.event,
      attempts: webhookEvent.attemptCount,
      error: webhookEvent.lastError,
    });
  }

  /**
   * Setup retry scheduler
   */
  private setupRetryScheduler(): void {
    setInterval(async () => {
      // Process pending webhooks
      const pendingWebhooks = this.deadLetterQueue.filter(
        w => w.status === 'pending' && w.nextRetryAt && new Date() >= w.nextRetryAt,
      );

      for (const webhook of pendingWebhooks) {
        await this.attemptDelivery(webhook);
      }
    }, 10000); // Check every 10 seconds
  }

  /**
   * Get dead letter queue
   */
  getDeadLetterQueue(limit: number = 100): WebhookEvent[] {
    return this.deadLetterQueue
      .filter(w => w.status === 'dead_lettered')
      .slice(0, limit);
  }

  /**
   * Replay webhook from dead letter queue
   */
  async replayWebhook(webhookId: string): Promise<boolean> {
    const webhook = this.deadLetterQueue.find(w => w.id === webhookId);
    if (!webhook) {
      throw new Error(`Webhook ${webhookId} not found`);
    }

    // Reset for replay
    webhook.status = 'pending';
    webhook.attemptCount = 0;
    webhook.nextRetryAt = undefined;
    webhook.lastError = undefined;

    log.info('Webhook replayed from dead letter queue', {
      id: webhook.id.slice(0, 8),
    });

    return this.attemptDelivery(webhook);
  }

  /**
   * Get delivery metrics
   */
  getMetrics(): WebhookDeliveryMetrics {
    const totalAttempts = this.metrics.totalEvents > 0 
      ? this.metrics.totalRetries / this.metrics.totalEvents 
      : 0;

    return {
      totalEvents: this.metrics.totalEvents,
      successCount: this.metrics.successCount,
      failedCount: this.metrics.failedCount,
      deadLetteredCount: this.metrics.deadLetteredCount,
      averageRetriesPerEvent: Math.round(totalAttempts * 100) / 100,
      successRate: this.metrics.totalEvents > 0
        ? this.metrics.successCount / this.metrics.totalEvents
        : 0,
    };
  }

  /**
   * Get recent webhook deliveries
   */
  getRecentDeliveries(limit: number = 50): WebhookEvent[] {
    return this.deadLetterQueue
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Mask endpoint for logging
   */
  private maskEndpoint(endpoint: string): string {
    try {
      const url = new URL(endpoint);
      return `${url.hostname}${url.pathname.slice(0, 20)}...`;
    } catch {
      return endpoint.slice(0, 20) + '...';
    }
  }
}

export const webhookRetryEngine = new WebhookRetryEngine();
