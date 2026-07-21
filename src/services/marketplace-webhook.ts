// ============================================================
// MARKETPLACE WEBHOOK — Notifications pour les developpeurs
// ============================================================
// Envoie des evenements aux webhooks enregistres lors des
// installations, publications, et mises a jour du marketplace.
// ============================================================

import { logger } from "@/lib/logger";

export type MarketplaceEvent =
  | "item.published"
  | "item.installed"
  | "item.updated"
  | "item.deleted"
  | "item.reviewed";

interface WebhookPayload {
  event: MarketplaceEvent;
  itemId: string;
  itemName: string;
  itemType: string;
  userId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// Enregistrement des webhooks (stockes en memoire, a persister en DB)
const webhookSubscriptions = new Map<string, Array<{ url: string; secret: string; events: MarketplaceEvent[] }>>();

class WebhookNotifier {
  /**
   * Enregistre un webhook pour un utilisateur.
   */
  subscribe(params: { userId: string; url: string; secret: string; events: MarketplaceEvent[] }): void {
    const existing = webhookSubscriptions.get(params.userId) ?? [];
    existing.push({ url: params.url, secret: params.secret, events: params.events });
    webhookSubscriptions.set(params.userId, existing);
    logger.info("webhook_subscribed", { userId: params.userId.slice(0, 8), events: params.events.length });
  }

  /**
   * Notifie tous les webhooks concernes par un evenement.
   */
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

    const body = JSON.stringify(payload);

    await Promise.allSettled(
      subscribers.map(async (sub) => {
        try {
          const signature = await this.sign(body, sub.secret);
          const response = await fetch(sub.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Genova-Event": payload.event,
              "X-Genova-Signature": signature,
              "X-Genova-Timestamp": payload.timestamp,
              "User-Agent": "Genova-Webhook/1.0",
            },
            body,
          });

          if (!response.ok) {
            logger.warn("webhook_delivery_failed", {
              url: sub.url.slice(0, 50),
              event: payload.event,
              status: response.status,
            });
          }
        } catch (error) {
          logger.error("webhook_delivery_error", {
            url: sub.url.slice(0, 50),
            error: String(error),
          });
        }
      }),
    );
  }

  /**
   * Signe le payload avec HMAC-SHA256.
   */
  private async sign(payload: string, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false, ["sign"],
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
    return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
}

export const webhookNotifier = new WebhookNotifier();