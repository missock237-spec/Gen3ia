/**
 * WhatsApp Router — Intégration retirée du projet Gen3ia.
 * Module neutralisé : aucune connexion, aucun envoi.
 * L'API publique est conservée pour ne pas casser les importateurs existants.
 */

// ---------------------------------------------------------------------------
// Types (conservés pour compatibilité)
// ---------------------------------------------------------------------------

export type WhatsAppProvider = 'baileys' | 'official';

export interface WhatsAppRouterStatus {
  activeProvider: WhatsAppProvider;
  baileysState: string;
  baileysQrRequired: boolean;
  baileysQrCode: string | null;
  baileysPhone: string | null;
  officialApiAvailable: boolean;
  lastActivity: string | null;
  fallbackMode: boolean;
  consecutiveBaileysFailures: number;
  fallbackRetryAt: string | null;
  messagesSent: number;
  messagesFailed: number;
}

export interface RouterSendMessageResult {
  provider: WhatsAppProvider;
  messageId: string;
  recipientWaId?: string;
  timestamp?: number;
}

export interface RouterSendImageResult {
  provider: WhatsAppProvider;
  messageId: string;
  timestamp?: number;
}

// ---------------------------------------------------------------------------
// Router neutralisé
// ---------------------------------------------------------------------------

const DISABLED_ERROR = 'WhatsApp a été retiré du projet Gen3ia';

class WhatsAppRouter {
  async sendMessage(_to: string, _message: string): Promise<RouterSendMessageResult> {
    throw new Error(DISABLED_ERROR);
  }

  async sendMessageQuick(_to: string, _message: string): Promise<RouterSendMessageResult> {
    throw new Error(DISABLED_ERROR);
  }

  async sendImage(_to: string, _imageBuffer: Buffer, _caption?: string): Promise<RouterSendImageResult> {
    throw new Error(DISABLED_ERROR);
  }

  async sendReaction(_to: string, _messageId: string, _emoji: string): Promise<void> {
    // Intégration retirée
  }

  async markAsRead(_jid: string, _messageId: string): Promise<void> {
    // Intégration retirée
  }

  async sendGroupMessage(_groupJid: string, _message: string): Promise<RouterSendMessageResult> {
    throw new Error(DISABLED_ERROR);
  }

  getConnectionStatus(): WhatsAppRouterStatus {
    return {
      activeProvider: 'official',
      baileysState: 'disconnected',
      baileysQrRequired: false,
      baileysQrCode: null,
      baileysPhone: null,
      officialApiAvailable: false,
      lastActivity: null,
      fallbackMode: false,
      consecutiveBaileysFailures: 0,
      fallbackRetryAt: null,
      messagesSent: 0,
      messagesFailed: 0,
    };
  }

  forceFallback(): void {
    // Intégration retirée
  }

  async resetToPrimary(): Promise<boolean> {
    return false;
  }
}

let _router: WhatsAppRouter | null = null;

export function getWhatsAppRouter(): WhatsAppRouter {
  if (!_router) {
    _router = new WhatsAppRouter();
  }
  return _router;
}

export { WhatsAppRouter };
