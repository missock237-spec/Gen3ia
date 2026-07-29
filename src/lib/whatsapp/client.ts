// ============================================================
// Gen3ia — WhatsApp Cloud API Client
// Envoi et réception de messages via Meta WhatsApp Cloud API
// Documentation: https://developers.facebook.com/docs/whatsapp/cloud-api
// ============================================================

import { createLogger } from '@/lib/logger';

const log = createLogger('whatsapp-client');

const WHATSAPP_API_VERSION = 'v22.0';
const WHATSAPP_BASE_URL = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;

interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  businessAccountId?: string;
}

function getConfig(): WhatsAppConfig | null {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
  if (!phoneNumberId || !accessToken) return null;
  return { phoneNumberId, accessToken, businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID };
}

// ============================================================
// TYPES
// ============================================================

export interface WhatsAppTextMessage {
  type: 'text';
  to: string;
  text: string;
  previewUrl?: boolean;
}

export interface WhatsAppTemplateMessage {
  type: 'template';
  to: string;
  templateName: string;
  languageCode: string;
  components?: Array<{
    type: 'header' | 'body' | 'button';
    parameters: Array<{ type: string; text?: string }>;
  }>;
}

export interface WhatsAppInteractiveMessage {
  type: 'interactive';
  to: string;
  interactive: {
    type: 'button' | 'list';
    body: { text: string };
    action: Record<string, unknown>;
  };
}

export type WhatsAppMessage = WhatsAppTextMessage | WhatsAppTemplateMessage | WhatsAppInteractiveMessage;

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ============================================================
// CLIENT WHATSAPP
// ============================================================

class WhatsAppClient {
  /**
   * Vérifie si le client est configuré
   */
  isConfigured(): boolean {
    return !!getConfig();
  }

  /**
   * Envoie un message texte WhatsApp
   */
  async sendText(to: string, text: string): Promise<WhatsAppSendResult> {
    return this.sendMessage({
      type: 'text',
      to,
      text: text.slice(0, 4096),
    });
  }

  /**
   * Envoie un message template
   */
  async sendTemplate(
    to: string,
    templateName: string,
    params?: Record<string, string>
  ): Promise<WhatsAppSendResult> {
    const components: WhatsAppTemplateMessage['components'] = [];
    if (params && Object.keys(params).length > 0) {
      components.push({
        type: 'body',
        parameters: Object.values(params).map(v => ({ type: 'text', text: v })),
      });
    }

    return this.sendMessage({
      type: 'template',
      to,
      templateName,
      languageCode: 'fr',
      components: components.length > 0 ? components : undefined,
    });
  }

  /**
   * Envoie un message interactif (boutons)
   */
  async sendButtons(to: string, text: string, buttons: Array<{ id: string; title: string }>): Promise<WhatsAppSendResult> {
    return this.sendMessage({
      type: 'interactive',
      to,
      interactive: {
        type: 'button',
        body: { text: text.slice(0, 1024) },
        action: {
          buttons: buttons.map(b => ({
            type: 'reply',
            reply: { id: b.id, title: b.title.slice(0, 20) },
          })),
        },
      },
    });
  }

  /**
   * Méthode générique d'envoi
   */
  private async sendMessage(msg: WhatsAppMessage): Promise<WhatsAppSendResult> {
    const config = getConfig();
    if (!config) {
      log.warn('WhatsApp non configuré (WHATSAPP_PHONE_NUMBER_ID requis)');
      return { success: false, error: 'WhatsApp non configuré' };
    }

    const url = `${WHATSAPP_BASE_URL}/${config.phoneNumberId}/messages`;

    const body: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: msg.to,
      type: msg.type,
    };

    if (msg.type === 'text') {
      body.text = { body: (msg as WhatsAppTextMessage).text, preview_url: (msg as WhatsAppTextMessage).previewUrl ?? false };
    } else if (msg.type === 'template') {
      const t = msg as WhatsAppTemplateMessage;
      body.template = {
        name: t.templateName,
        language: { code: t.languageCode },
        components: t.components,
      };
    } else if (msg.type === 'interactive') {
      body.interactive = (msg as WhatsAppInteractiveMessage).interactive;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });

      const data = await response.json();

      if (!response.ok) {
        log.error('whatsapp_send_failed', { to: msg.to, status: response.status, error: data.error });
        return { success: false, error: data.error?.message || `HTTP ${response.status}` };
      }

      log.info('whatsapp_sent', { to: msg.to, type: msg.type, messageId: data.messages?.[0]?.id });
      return { success: true, messageId: data.messages?.[0]?.id };
    } catch (error) {
      const msg2 = error instanceof Error ? error.message : String(error);
      log.error('whatsapp_send_error', { to: msg.to, error: msg2 });
      return { success: false, error: msg2 };
    }
  }

  /**
   * Récupère les numéros de téléphone associés au compte WhatsApp Business
   */
  async getPhoneNumbers(): Promise<Array<{ id: string; displayPhoneNumber: string }>> {
    const config = getConfig();
    if (!config) return [];
    try {
      const res = await fetch(`${WHATSAPP_BASE_URL}/${config.businessAccountId || config.phoneNumberId}/phone_numbers`, {
        headers: { Authorization: `Bearer ${config.accessToken}` },
        signal: AbortSignal.timeout(10000),
      });
      const data = await res.json();
      return data.data || [];
    } catch { return []; }
  }
}

export const whatsappClient = new WhatsAppClient();
