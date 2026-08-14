// ============================================================
// WEBHOOK ENGINE — Envoi de webhooks sortants
// Retry, signature HMAC, templating, logs
// ============================================================
import { prisma } from './prisma';
import { createLogger } from './logger';
import { validateUrl } from './ssrf-protect';

const log = createLogger('webhook-engine');

export interface WebhookPayload {
  url: string;
  method?: 'POST' | 'PUT' | 'PATCH' | 'GET';
  headers?: Record<string, string>;
  body?: any;
  secret?: string;
  retryCount?: number;
  timeout?: number;
}

export interface WebhookResult {
  success: boolean;
  statusCode: number;
  durationMs: number;
  responseBody?: string;
  attempts: number;
  error?: string;
}

export interface WebhookConfigInput {
  userId: string;
  name: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  secret?: string;
  retryCount?: number;
  timeout?: number;
  template?: string;
}

export class WebhookEngine {
  /**
   * Envoie un webhook avec retry et signature
   */
  async send(payload: WebhookPayload): Promise<WebhookResult> {
    const startTime = Date.now();
    const maxRetries = payload.retryCount ?? 3;
    const timeout = payload.timeout ?? 10000;
    let lastError: string | undefined;
    let attempts = 0;

    // Validation SSRF de l'URL cible
    const ssrfCheck = validateUrl(payload.url, { requireHttps: true });
    if (!ssrfCheck.safe) {
      log.warn('webhook_ssrf_blocked', { url: payload.url, error: ssrfCheck.error });
      return {
        success: false,
        statusCode: 0,
        durationMs: Date.now() - startTime,
        attempts: 0,
        error: `SSRF bloqué: ${ssrfCheck.error}`,
      };
    }

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      attempts++;
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'User-Agent': 'Gen3ia-Webhook/1.0',
          'X-Gen3ia-Event': 'workflow.webhook',
          'X-Gen3ia-Attempt': String(attempt + 1),
          ...payload.headers,
        };

        // Signature HMAC si secret fourni
        if (payload.secret) {
          const bodyStr = JSON.stringify(payload.body || {});
          const encoder = new TextEncoder();
          const key = await crypto.subtle.importKey('raw', encoder.encode(payload.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
          const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(bodyStr));
          headers['X-Gen3ia-Signature'] = 'sha256=' + Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
        }

        // Timestamp pour anti-replay
        headers['X-Gen3ia-Timestamp'] = Math.floor(Date.now() / 1000).toString();

        const response = await fetch(payload.url, {
          method: payload.method || 'POST',
          headers,
          body: payload.body ? JSON.stringify(payload.body) : undefined,
          signal: AbortSignal.timeout(timeout),
        });

        const responseBody = await response.text().catch(() => '');

        const result: WebhookResult = {
          success: response.ok,
          statusCode: response.status,
          durationMs: Date.now() - startTime,
          responseBody: responseBody.slice(0, 1000),
          attempts,
        };

        if (response.ok) {
          log.info('webhook_sent', { url: payload.url.slice(0, 80), status: response.status, attempts });
          return result;
        }

        lastError = `HTTP ${response.status}: ${responseBody.slice(0, 200)}`;
        log.warn('webhook_retry', { url: payload.url.slice(0, 80), attempt: attempt + 1, status: response.status });

        // Attente exponentielle
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
        }
      } catch (err: any) {
        lastError = err.message || 'Erreur inconnue';
        log.warn('webhook_retry_error', { url: payload.url.slice(0, 80), attempt: attempt + 1, error: lastError });
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
        }
      }
    }

    return {
      success: false,
      statusCode: 0,
      durationMs: Date.now() - startTime,
      attempts,
      error: lastError,
    };
  }

  /**
   * Cree une configuration de webhook
   */
  async createConfig(input: WebhookConfigInput) {
    const config = await prisma.webhookConfig.create({
      data: {
        userId: input.userId,
        name: input.name,
        url: input.url,
        method: input.method || 'POST',
        headers: JSON.stringify(input.headers || {}),
        secret: input.secret || null,
        retryCount: input.retryCount ?? 3,
        timeout: input.timeout ?? 10000,
        template: input.template || '{}',
      },
    });
    log.info('webhook_config_created', { configId: config.id, name: input.name });
    return config;
  }

  /**
   * Execute un webhook depuis une config
   */
  async executeConfig(configId: string, data?: any) {
    const config = await prisma.webhookConfig.findUnique({ where: { id: configId } });
    if (!config) throw new Error('Configuration webhook introuvable');

    // Remplir le template avec les donnees
    let body: any;
    try {
      const template = JSON.parse(config.template || '{}');
      body = this.fillTemplate(template, data || {});
    } catch {
      body = data || {};
    }

    const result = await this.send({
      url: config.url,
      method: config.method as any,
      headers: JSON.parse(config.headers || '{}'),
      body,
      secret: config.secret || undefined,
      retryCount: config.retryCount,
      timeout: config.timeout,
    });

    // Logger
    await prisma.webhookLog.create({
      data: {
        configId: config.id,
        status: result.success ? 'success' : 'failed',
        statusCode: result.statusCode,
        durationMs: result.durationMs,
        responseBody: result.responseBody || null,
        error: result.error || null,
        attempts: result.attempts,
      },
    });

    return result;
  }

  /**
   * Execute un webhook direct (sans config)
   */
  async executeDirect(payload: WebhookPayload, userId: string) {
    const result = await this.send(payload);

    // Logger meme sans config
    await prisma.webhookLog.create({
      data: {
        configId: null,
        status: result.success ? 'success' : 'failed',
        statusCode: result.statusCode,
        durationMs: result.durationMs,
        responseBody: result.responseBody || null,
        error: result.error || null,
        attempts: result.attempts,
        metadata: JSON.stringify({ url: payload.url, method: payload.method }),
      },
    });

    return result;
  }

  /**
   * Remplit un template avec des valeurs
   */
  private fillTemplate(template: any, data: any): any {
    if (typeof template === 'string') {
      return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
        const val = path.split('.').reduce((obj, key) => obj?.[key], data);
        return val !== undefined ? String(val) : '';
      });
    }
    if (Array.isArray(template)) {
      return template.map(item => this.fillTemplate(item, data));
    }
    if (template && typeof template === 'object') {
      const result: Record<string, any> = {};
      for (const [key, val] of Object.entries(template)) {
        result[key] = this.fillTemplate(val, data);
      }
      return result;
    }
    return template;
  }

  async getConfigs(userId: string) {
    return prisma.webhookConfig.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { logs: true } } },
    });
  }

  async getLogs(configId?: string, limit = 20) {
    const where: any = {};
    if (configId) where.configId = configId;
    return prisma.webhookLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async deleteConfig(configId: string, userId: string) {
    return prisma.webhookConfig.deleteMany({ where: { id: configId, userId } });
  }
}

export const webhookEngine = new WebhookEngine();
export default webhookEngine;
