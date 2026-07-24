// ============================================================
// MARKETPLACE WEBHOOK — Notifications avec ResourceGuard
// ============================================================

import { logger } from "@/lib/logger";
import { ResourceGuard, limitString } from "@/lib/resource-guard";

const guard = new ResourceGuard({ timeoutMs: 15000, maxArraySize: 50 });

export type MarketplaceEvent = "item.published" | "item.installed" | "item.updated" | "item.deleted" | "item.reviewed";

interface WebhookPayload {
  event: MarketplaceEvent;
  itemId: string;
  itemName: string;
  itemType: string;
  userId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

const webhookSubscriptions = new Map<string, Array<{ url: string; secret: string; events: MarketplaceEvent[] }>>();

class WebhookNotifier {
  subscribe(params: { userId: string; url: string; secret: string; events: MarketplaceEvent[] }): void {
    const existing = webhookSubscriptions.get(params.userId) ?? [];
    if (existing.length >= 20) { // Hard limit: max 20 webhooks par user
      logger.warn("webhook_limit_reached", { userId: params.userId.slice(0, 8) });
      return;
    }
    existing.push({ url: params.url, secret: params.secret, events: params.events });
    webhookSubscriptions.set(params.userId, existing);
    logger.info("webhook_subscribed", { userId: params.userId.slice(0, 8), events: params.events.length });
  }

  async notify(payload: WebhookPayload): Promise<void> {
    const subscribers: Array<{ url: string; secret: string }> = [];

    for (const [, subscriptions] of webhookSubscriptions) {
      for (const sub of subscriptions) {
        if (sub.events.includes(payload.event)) {
          subscribers.push({ url: sub.url, secret: sub.secret });
        }
      }
    }

    if (subscribers.length === 0) return;

    // Limiter le nombre de webhooks a notifier
    const limitedSubscribers = guard.limitArray(subscribers, 50);

    const body = JSON.stringify(guard.limitDepth(payload, 5));

    await guard.concurrentLimit(
      limitedSubscribers.map((sub) => async () => {
        try {
          const encoder = new TextEncoder();
          const key = await crypto.subtle.importKey("raw", encoder.encode(sub.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
          const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
          const sigHex = Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");

          const response = await fetch(sub.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Genova-Event": payload.event,
              "X-Genova-Signature": sigHex,
              "X-Genova-Timestamp": payload.timestamp,
              "User-Agent": "Genova-Webhook/1.0",
            },
            body,
          });

          if (!response.ok) {
            logger.warn("webhook_delivery_failed", { url: limitString(sub.url, 50), event: payload.event, status: response.status });
          }
        } catch (error) {
          logger.error("webhook_delivery_error", { url: limitString(sub.url, 50), error: String(error) });
        }
      }),
      10 // Max 10 webhooks concurrents
    );
  }
}

export const webhookNotifier = new WebhookNotifier();
