import { createLogger } from '@/lib/logger';

const logger = createLogger('whatsapp-engine');

// ============================================================
// Types WhatsApp Business API (Meta Cloud API v18.0)
// ============================================================

export interface WhatsAppTemplateParameter {
  type: 'text' | 'image' | 'currency' | 'date_time';
  text?: string;
  image?: {
    link?: string;
    id?: string;
  };
  currency?: {
    fallback_value: string;
    code: string;
    amount_1000: number;
  };
  date_time?: {
    fallback_value: string;
  };
}

export interface WhatsAppTemplateComponent {
  type: 'header' | 'body' | 'button';
  sub_type?: 'quick_reply' | 'url';
  index?: string;
  parameters?: WhatsAppTemplateParameter[];
}

export interface WhatsAppTemplate {
  name: string;
  language: {
    code: string; // Ex: 'fr' (par défaut au Cameroun) ou 'en'
  };
  components?: WhatsAppTemplateComponent[];
}

export interface WhatsAppMessage {
  id: string;
  from: string; // Numéro de téléphone de l'expéditeur
  to?: string;   // Numéro destinataire ou ID du numéro WhatsApp Business
  timestamp: string;
  type: 'text' | 'image' | 'template' | 'interactive' | 'audio' | 'document' | 'unknown';
  text?: {
    body: string;
  };
  image?: {
    id?: string;
    mime_type?: string;
    sha256?: string;
    caption?: string;
    link?: string;
    url?: string;
  };
  template?: WhatsAppTemplate;
  raw?: unknown;
}

export interface WhatsAppWebhookContact {
  profile: {
    name: string;
  };
  wa_id: string;
}

export interface WhatsAppWebhookStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  errors?: Array<{
    code: number;
    title: string;
    message?: string;
  }>;
}

export interface WhatsAppWebhookValue {
  messaging_product: string;
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: WhatsAppWebhookContact[];
  messages?: Array<{
    from: string;
    id: string;
    timestamp: string;
    type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'interactive' | string;
    text?: { body: string };
    image?: { caption?: string; mime_type: string; sha256: string; id: string };
    audio?: { id: string; mime_type: string };
    document?: { id: string; filename: string; mime_type: string };
    interactive?: {
      type: string;
      button_reply?: { id: string; title: string };
      list_reply?: { id: string; title: string; description?: string };
    };
  }>;
  statuses?: WhatsAppWebhookStatus[];
}

export interface WhatsAppWebhookChange {
  value: WhatsAppWebhookValue;
  field: string;
}

export interface WhatsAppWebhookEntry {
  id: string;
  changes: WhatsAppWebhookChange[];
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry?: WhatsAppWebhookEntry[];
}

export interface SendMessageOptions {
  imageUrl?: string;
  caption?: string;
  previewUrl?: boolean;
}

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
  details?: unknown;
}

export interface WhatsAppStatusResult {
  configured: boolean;
  phoneNumberId?: string;
  businessId?: string;
  hasVerifyToken: boolean;
  rateLimit: {
    maxPerMinute: number;
    currentCount: number;
    availableSlot: number;
  };
}

/**
 * Nettoie et formate les numéros de téléphone pour l'Afrique Centrale (Cameroun).
 * WhatsApp Cloud API exige les numéros au format E.164 sans le signe '+'.
 * Exemples au Cameroun :
 * - '699000000' -> '237699000000' (Numéro local Orange/MTN à 9 chiffres)
 * - '+237 6 99 00 00 00' -> '237699000000'
 */
export function formatPhoneNumber(phone: string): string {
  if (!phone) return '';
  let cleaned = phone.replace(/\D/g, '');
  
  // Format local Cameroun : 9 chiffres commmençant par 6 ou 2
  if (cleaned.length === 9 && (cleaned.startsWith('6') || cleaned.startsWith('2'))) {
    cleaned = `237${cleaned}`;
  }
  
  return cleaned;
}

/**
 * Moteur WhatsApp Business API Cloud v18.0
 * Conçu spécifiquement pour le contexte de commerce conversationnel en Afrique (Cameroun).
 * 
 * Pourquoi ce moteur est adapté au marché africain :
 * 1. WhatsApp est le canal principal de vente directe (Orange Money, Mobile Money, commandes directes).
 * 2. Les fenêtres de 24h Meta exigent l'utilisation de templates officiels pour l'engagement proactif.
 * 3. Gestion stricte du Rate Limiting (80 msgs/min) pour éviter le blocage du numéro par Meta lors de campagnes intenses.
 * 4. Normalisation automatique des numéros camerounais (+237).
 */
export class WhatsAppEngine {
  private readonly baseUrl = 'https://graph.facebook.com/v18.0';
  private readonly maxRateLimitPerMinute = 80; // Limite stricte imposée par Meta par numéro
  private sendTimestamps: number[] = [];

  /**
   * Vérifie si les variables d'environnement requises sont bien définies
   */
  public isConfigured(): boolean {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    return Boolean(token && phoneId);
  }

  /**
   * Récupère la clé de vérification de Webhook
   */
  private getVerifyToken(): string {
    return process.env.WHATSAPP_VERIFY_TOKEN || '';
  }

  /**
   * Vérifie le Rate Limit glissant sur 60 secondes.
   */
  private checkRateLimit(): boolean {
    const now = Date.now();
    const windowStart = now - 60000; // Fenêtre de 1 minute
    this.sendTimestamps = this.sendTimestamps.filter((t) => t > windowStart);

    if (this.sendTimestamps.length >= this.maxRateLimitPerMinute) {
      logger.warn('Rate limit WhatsApp atteint (80 messages/min)', {
        currentCount: this.sendTimestamps.length,
        maxLimit: this.maxRateLimitPerMinute,
      });
      return false;
    }

    this.sendTimestamps.push(now);
    return true;
  }

  /**
   * Vérifie le webhook entrant (GET verification flow de Meta).
   */
  public verifyWebhook(mode: string | null, challenge: string | null, token: string | null): string | null {
    const verifyToken = this.getVerifyToken();

    if (mode === 'subscribe' && token && token === verifyToken && challenge) {
      logger.info('Webhook WhatsApp vérifié avec succès');
      return challenge;
    }

    logger.warn('Échec de vérification du Webhook WhatsApp', {
      modeReceived: mode,
      tokenMatches: token === verifyToken,
    });
    return null;
  }

  /**
   * Traite le payload du Webhook entrant et extrait les messages normalisés.
   */
  public receiveWebhook(payload: WhatsAppWebhookPayload): {
    messages: WhatsAppMessage[];
    contacts: WhatsAppWebhookContact[];
    statuses: WhatsAppWebhookStatus[];
  } {
    const extractedMessages: WhatsAppMessage[] = [];
    const extractedContacts: WhatsAppWebhookContact[] = [];
    const extractedStatuses: WhatsAppWebhookStatus[] = [];

    if (!payload || payload.object !== 'whatsapp_business_account' || !payload.entry) {
      return { messages: [], contacts: [], statuses: [] };
    }

    for (const entry of payload.entry) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (!value) continue;

        // Extraction des contacts
        if (value.contacts) {
          extractedContacts.push(...value.contacts);
        }

        // Extraction des statuts de remise / lecture
        if (value.statuses) {
          extractedStatuses.push(...value.statuses);
        }

        // Extraction des messages reçus
        if (value.messages) {
          for (const msg of value.messages) {
            let messageType: WhatsAppMessage['type'] = 'unknown';
            if (msg.type === 'text') messageType = 'text';
            else if (msg.type === 'image') messageType = 'image';
            else if (msg.type === 'audio') messageType = 'audio';
            else if (msg.type === 'document') messageType = 'document';
            else if (msg.type === 'interactive') messageType = 'interactive';

            let textBody = msg.text?.body;
            if (msg.type === 'interactive') {
              textBody = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '';
            }

            extractedMessages.push({
              id: msg.id,
              from: msg.from,
              to: value.metadata?.phone_number_id,
              timestamp: msg.timestamp,
              type: messageType,
              text: textBody ? { body: textBody } : undefined,
              image: msg.image
                ? {
                    id: msg.image.id,
                    mime_type: msg.image.mime_type,
                    sha256: msg.image.sha256,
                    caption: msg.image.caption,
                  }
                : undefined,
              raw: msg,
            });
          }
        }
      }
    }

    logger.info('Payload Webhook WhatsApp traité', {
      messageCount: extractedMessages.length,
      contactCount: extractedContacts.length,
      statusCount: extractedStatuses.length,
    });

    return {
      messages: extractedMessages,
      contacts: extractedContacts,
      statuses: extractedStatuses,
    };
  }

  /**
   * Envoie un message texte ou média (image) via l'API Cloud de Meta.
   */
  public async sendMessage(
    to: string,
    text: string,
    options?: SendMessageOptions
  ): Promise<SendMessageResult> {
    if (!this.isConfigured()) {
      logger.warn('WhatsApp non configuré - WHATSAPP_TOKEN ou WHATSAPP_PHONE_NUMBER_ID manquant');
      return {
        success: false,
        error: 'WhatsApp Business API non configuré dans les variables d’environnement.',
      };
    }

    if (!this.checkRateLimit()) {
      return {
        success: false,
        error: 'Limite d’envoi WhatsApp dépassée (80 messages par minute). Veuillez rééquilibrer.',
      };
    }

    const formattedTo = formatPhoneNumber(to);
    if (!formattedTo) {
      return {
        success: false,
        error: 'Numéro de téléphone destinataire invalide.',
      };
    }

    const token = process.env.WHATSAPP_TOKEN!;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
    const url = `${this.baseUrl}/${phoneNumberId}/messages`;

    let payload: Record<string, unknown>;

    if (options?.imageUrl) {
      // Message Média Image (très utilisé pour fiches produits / reçus au Cameroun)
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedTo,
        type: 'image',
        image: {
          link: options.imageUrl,
          caption: options.caption || text || undefined,
        },
      };
    } else {
      // Message Texte standard
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedTo,
        type: 'text',
        text: {
          preview_url: options?.previewUrl ?? false,
          body: text,
        },
      };
    }

    try {
      logger.info('Envoi de message WhatsApp', { to: formattedTo, type: payload.type });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        logger.error('Erreur API WhatsApp lors de l’envoi', { status: response.status, data });
        return {
          success: false,
          error: data?.error?.message || 'Erreur lors de l’envoi du message WhatsApp',
          details: data,
        };
      }

      const messageId = data?.messages?.[0]?.id;
      logger.info('Message WhatsApp envoyé avec succès', { messageId, to: formattedTo });

      return {
        success: true,
        messageId,
      };
    } catch (err) {
      logger.error('Exception lors de l’envoi du message WhatsApp', { error: err });
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Erreur réseau inconnue',
      };
    }
  }

  /**
   * Envoie un template de message WhatsApp homologué par Meta.
   * Indispensable pour réengager les clients après la fenêtre de service de 24h au Cameroun.
   */
  public async sendTemplate(
    to: string,
    templateName: string,
    params?: Record<string, string> | string[] | WhatsAppTemplateParameter[],
    languageCode = 'fr'
  ): Promise<SendMessageResult> {
    if (!this.isConfigured()) {
      logger.warn('WhatsApp non configuré lors de l’envoi du template');
      return {
        success: false,
        error: 'WhatsApp Business API non configuré.',
      };
    }

    if (!this.checkRateLimit()) {
      return {
        success: false,
        error: 'Limite d’envoi WhatsApp dépassée (80 messages par minute).',
      };
    }

    const formattedTo = formatPhoneNumber(to);
    if (!formattedTo) {
      return {
        success: false,
        error: 'Numéro destinataire invalide.',
      };
    }

    const token = process.env.WHATSAPP_TOKEN!;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
    const url = `${this.baseUrl}/${phoneNumberId}/messages`;

    // Normalisation des paramètres du template
    let parameterList: WhatsAppTemplateParameter[] = [];

    if (Array.isArray(params)) {
      parameterList = params.map((p) => {
        if (typeof p === 'string') {
          return { type: 'text', text: p };
        }
        return p;
      });
    } else if (params && typeof params === 'object') {
      parameterList = Object.values(params).map((val) => ({
        type: 'text',
        text: String(val),
      }));
    }

    const components: WhatsAppTemplateComponent[] = [];
    if (parameterList.length > 0) {
      components.push({
        type: 'body',
        parameters: parameterList,
      });
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedTo,
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: languageCode,
        },
        ...(components.length > 0 ? { components } : {}),
      },
    };

    try {
      logger.info('Envoi de template WhatsApp', { to: formattedTo, templateName, languageCode });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        logger.error('Erreur API Meta WhatsApp lors de l’envoi du template', {
          status: response.status,
          data,
        });
        return {
          success: false,
          error: data?.error?.message || 'Erreur d’envoi du template WhatsApp',
          details: data,
        };
      }

      const messageId = data?.messages?.[0]?.id;
      logger.info('Template WhatsApp envoyé avec succès', { messageId, templateName, to: formattedTo });

      return {
        success: true,
        messageId,
      };
    } catch (err) {
      logger.error('Exception lors de l’envoi du template WhatsApp', { error: err });
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Erreur réseau inconnue',
      };
    }
  }

  /**
   * Retourne le statut courant de la configuration et la disponibilité du canal.
   */
  public getStatus(): WhatsAppStatusResult {
    const configured = this.isConfigured();
    const now = Date.now();
    const windowStart = now - 60000;
    this.sendTimestamps = this.sendTimestamps.filter((t) => t > windowStart);

    return {
      configured,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || undefined,
      businessId: process.env.WHATSAPP_BUSINESS_ID || undefined,
      hasVerifyToken: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
      rateLimit: {
        maxPerMinute: this.maxRateLimitPerMinute,
        currentCount: this.sendTimestamps.length,
        availableSlot: this.maxRateLimitPerMinute - this.sendTimestamps.length,
      },
    };
  }
}

// Exportation de l'instance singleton
export const whatsapp = new WhatsAppEngine();
export default whatsapp;
