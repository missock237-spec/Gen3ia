/**
 * WhatsApp Business API Client — Intégration retirée du projet Gen3ia.
 * Module neutralisé : aucune dépendance externe, aucune appel réseau.
 * L'API publique est conservée pour ne pas casser les importateurs existants.
 */

// ---------------------------------------------------------------------------
// Types (conservés pour compatibilité)
// ---------------------------------------------------------------------------

export interface WhatsAppMessageResponse {
  messageId: string;
  recipientWaId: string;
  raw?: Record<string, unknown>;
}

export interface WhatsAppCallResponse {
  callId: string;
  raw?: Record<string, unknown>;
}

export interface WhatsAppVerifyResponse {
  valid: boolean;
  appId?: string;
  appName?: string;
  error?: string;
}

export interface WhatsAppClientConfig {
  apiToken: string;
  phoneNumberId: string;
  businessAccountId?: string;
  apiVersion?: string;
  timeoutMs?: number;
  maxRetries?: number;
  baseRetryDelayMs?: number;
}

export const MAX_MESSAGE_LENGTH = 4096;

// ---------------------------------------------------------------------------
// Helpers conservés (purs, sans dépendance)
// ---------------------------------------------------------------------------

/** Strip all HTML tags, collapse whitespace, trim. */
export function sanitizeMessage(raw: string): string {
  let clean = raw.replace(/<[^>]*>/g, '');
  clean = clean
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return clean.replace(/\s+/g, ' ').trim();
}

export function validatePhoneNumber(phone: string): { valid: boolean; normalized: string } {
  const stripped = phone.replace(/[\s\-().]/g, '');
  const regex = /^\+?[1-9]\d{6,14}$/;
  if (!regex.test(stripped)) {
    return { valid: false, normalized: stripped };
  }
  const normalized = stripped.startsWith('+') ? stripped : `+${stripped}`;
  return { valid: true, normalized };
}

// ---------------------------------------------------------------------------
// Client neutralisé
// ---------------------------------------------------------------------------

const DISABLED_ERROR = 'WhatsApp a été retiré du projet Gen3ia';

export class WhatsAppApiError extends Error {
  public readonly status: number;
  public readonly code?: number;

  constructor(message: string, status: number, code?: number) {
    super(message);
    this.name = 'WhatsAppApiError';
    this.status = status;
    this.code = code;
  }
}

export class WhatsAppClient {
  constructor(_config: WhatsAppClientConfig) {
    // Intégration retirée
  }

  async sendMessage(_to: string, _message: string): Promise<WhatsAppMessageResponse> {
    throw new Error(DISABLED_ERROR);
  }

  async initiateCall(_to: string, _message?: string): Promise<WhatsAppCallResponse> {
    throw new Error(DISABLED_ERROR);
  }

  async verifyToken(): Promise<WhatsAppVerifyResponse> {
    return { valid: false, error: DISABLED_ERROR };
  }
}

let _client: WhatsAppClient | null = null;

export function getWhatsAppClient(overridePhoneNumberId?: string): WhatsAppClient {
  const apiToken = process.env.WHATSAPP_API_TOKEN;
  const phoneNumberId = overridePhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!apiToken) {
    throw new Error('WHATSAPP_API_TOKEN environment variable is not set');
  }
  if (!phoneNumberId) {
    throw new Error('WHATSAPP_PHONE_NUMBER_ID environment variable is not set');
  }

  if (!_client) {
    _client = new WhatsAppClient({ apiToken, phoneNumberId });
  }
  return _client;
}

export function createWhatsAppClient(config: WhatsAppClientConfig): WhatsAppClient {
  return new WhatsAppClient(config);
}
