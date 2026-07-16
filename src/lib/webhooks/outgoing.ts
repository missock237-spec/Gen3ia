/**
 * Webhooks sortants — Notifications vers des services externes
 * Supporte : Slack, Discord, Telegram, Webhook personnalisé
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('webhooks');

export type WebhookEvent =
  | 'agent.created'
  | 'agent.completed'
  | 'agent.failed'
  | 'credit.low'
  | 'credit.depleted'
  | 'purchase.completed'
  | 'subscription.changed'
  | 'marketplace.sold'
  | 'user.registered';

export interface WebhookPayload {
  event: WebhookEvent;
  userId: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface WebhookConfig {
  url: string;
  events: WebhookEvent[];
  secret?: string;
  retries?: number;
}

const WEBHOOK_TIMEOUT_MS = 10000;

/**
 * Envoie un webhook à tous les endpoints configurés
 */
export async function dispatchWebhook(
  event: WebhookEvent,
  userId: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  const payload: WebhookPayload = {
    event,
    userId,
    timestamp: new Date().toISOString(),
    data,
  };

  // Récupérer les webhooks configurés pour cet événement
  const configs = getWebhookConfigsForEvent(event);

  for (const config of configs) {
    await sendWebhook(config, payload);
  }
}

async function sendWebhook(config: WebhookConfig, payload: WebhookPayload, attempt = 0): Promise<void> {
  const maxRetries = config.retries ?? 3;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'GenovaAI-Webhook/1.0',
      'X-Genova-Event': payload.event,
      'X-Genova-Timestamp': payload.timestamp,
    };

    if (config.secret) {
      headers['X-Genova-Signature'] = await signPayload(payload, config.secret);
    }

    const response = await fetch(config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Webhook ${config.url} responded with ${response.status}`);
    }

    log.info('Webhook envoyé', { event: payload.event, url: config.url });
  } catch (err) {
    if (attempt < maxRetries) {
      const delay = Math.pow(2, attempt) * 1000;
      log.warn('Webhook échoué, nouvelle tentative', { attempt, delay });
      await new Promise(r => setTimeout(r, delay));
      return sendWebhook(config, payload, attempt + 1);
    }
    log.error('Webhook définitivement échoué', { url: config.url, error: err instanceof Error ? err.message : String(err) });
  }
}

async function signPayload(payload: WebhookPayload, secret: string): Promise<string> {
  const { createHmac } = await import('crypto');
  const data = JSON.stringify(payload);
  return createHmac('sha256', secret).update(data).digest('hex');
}

function getWebhookConfigsForEvent(event: WebhookEvent): WebhookConfig[] {
  // À terme, ces configs viendront de la base de données
  // Pour l'instant, on utilise les variables d'environnement
  const configs: WebhookConfig[] = [];

  const envUrl = process.env[`WEBHOOK_${event.toUpperCase().replace(/./g, '_')}`];
  const globalUrl = process.env.WEBHOOK_GLOBAL_URL;

  if (envUrl) {
    configs.push({ url: envUrl, events: [event] });
  }
  if (globalUrl) {
    configs.push({ url: globalUrl, events: [event], secret: process.env.WEBHOOK_GLOBAL_SECRET });
  }

  return configs;
}

export const WEBHOOK_EVENTS: { id: WebhookEvent; label: string; description: string }[] = [
  { id: 'agent.created', label: 'Agent créé', description: 'Quand un agent est créé' },
  { id: 'agent.completed', label: 'Tâche terminée', description: 'Quand un agent termine une tâche' },
  { id: 'agent.failed', label: 'Tâche échouée', description: 'Quand un agent échoue' },
  { id: 'credit.low', label: 'Crédits faibles', description: 'Quand il reste moins de 20 crédits' },
  { id: 'credit.depleted', label: 'Crédits épuisés', description: 'Quand les crédits sont à 0' },
  { id: 'purchase.completed', label: 'Achat effectué', description: 'Après un achat réussi' },
  { id: 'marketplace.sold', label: 'Vente marketplace', description: 'Quand un agent est vendu' },
  { id: 'user.registered', label: 'Nouvel utilisateur', description: 'Quand un utilisateur s\'inscrit' },
];

// Intégration Zapier / Make / n8n compatible
export const ZAPIER_WEBHOOK_URL = process.env.ZAPIER_WEBHOOK_URL;
export const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;
export const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
