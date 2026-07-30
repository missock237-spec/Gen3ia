/**
 * WhatsApp Router — Point d'entrée unifié pour toutes les opérations WhatsApp
 *
 * Stratégie : Baileys FIRST → WhatsApp Cloud API FALLBACK
 *
 * Fonctionnalités :
 * - Envoi de messages (texte, image, audio, réaction)
 * - Simulation de frappe (typing) pour un rendu naturel
 * - Fallback automatique après 3 échecs Baileys consécutifs
 * - Reconnexion automatique après 5 minutes
 * - Marquage des messages comme lus
 * - Envoi de réactions (emoji)
 */

import { createLogger } from '@/lib/logger';
import { getBaileysService, type BaileysConnectionState } from '@/lib/whatsapp-baileys';
import { getWhatsAppClient, type WhatsAppMessageResponse } from '@/lib/whatsapp-client';
import { registerBaileysAutoResponder } from '@/lib/whatsapp-auto-responder';

const log = createLogger('whatsapp-router');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WhatsAppProvider = 'baileys' | 'official';

export interface WhatsAppRouterStatus {
  activeProvider: WhatsAppProvider;
  baileysState: BaileysConnectionState;
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
// Router class
// ---------------------------------------------------------------------------

class WhatsAppRouter {
  private activeProvider: WhatsAppProvider = 'baileys';
  private fallbackMode = false;
  private consecutiveBaileysFailures = 0;
  private readonly maxConsecutiveFailures = 3;
  private fallbackRetryAt: Date | null = null;
  private fallbackDurationMs = 5 * 60 * 1000; // 5 minutes
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private lastProviderSwitch: Date | null = null;
  private stats = { messagesSent: 0, messagesFailed: 0 };

  constructor() {
    this.initBaileys().catch((err) => {
      log.warn('Baileys auto-connect failed on init', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Envoie un message texte avec simulation de typing naturelle
   */
  async sendMessage(to: string, message: string): Promise<RouterSendMessageResult> {
    this.maybeResetFromFallback();

    if (!this.fallbackMode && this.activeProvider === 'baileys') {
      try {
        const baileys = getBaileysService();
        if (baileys.isConnected()) {
          // Simulation de frappe (durée proportionnelle à la longueur du message)
          const typingMs = Math.min(Math.max(message.length * 15, 500), 3000);
          const result = await baileys.sendMessageWithTyping(to, message, typingMs);
          this.onBaileysSuccess();
          this.stats.messagesSent++;
          return {
            provider: 'baileys',
            messageId: result.messageId,
            timestamp: result.timestamp,
          };
        } else {
          log.info('Baileys not connected, falling back to official API', {
            state: baileys.getConnectionState(),
          });
        }
      } catch (error) {
        this.onBaileysFailure(error);
        log.warn('Baileys send failed, falling back to official API', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Fallback API officielle
    return this.sendViaOfficialApi(to, message);
  }

  /**
   * Envoie un message sans typing (pour usage interne/automatisé)
   */
  async sendMessageQuick(to: string, message: string): Promise<RouterSendMessageResult> {
    this.maybeResetFromFallback();

    if (!this.fallbackMode && this.activeProvider === 'baileys') {
      try {
        const baileys = getBaileysService();
        if (baileys.isConnected()) {
          const result = await baileys.sendMessage(to, message);
          this.onBaileysSuccess();
          this.stats.messagesSent++;
          return {
            provider: 'baileys',
            messageId: result.messageId,
            timestamp: result.timestamp,
          };
        }
      } catch (error) {
        this.onBaileysFailure(error);
      }
    }

    return this.sendViaOfficialApi(to, message);
  }

  /**
   * Envoie une image via Baileys (pas supporté par l'API officielle sans upload)
   */
  async sendImage(to: string, imageBuffer: Buffer, caption?: string): Promise<RouterSendImageResult> {
    this.maybeResetFromFallback();

    if (!this.fallbackMode && this.activeProvider === 'baileys') {
      try {
        const baileys = getBaileysService();
        if (baileys.isConnected()) {
          const result = await baileys.sendImage(to, imageBuffer, caption);
          this.onBaileysSuccess();
          this.stats.messagesSent++;
          return {
            provider: 'baileys',
            messageId: result.messageId,
            timestamp: result.timestamp,
          };
        }
      } catch (error) {
        this.onBaileysFailure(error);
        log.warn('Baileys image send failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Fallback texte si l'API officielle ne supporte pas l'image directement
    const fallbackText = caption
      ? `[📷 Image: ${caption}]`
      : '[📷 Image — non disponible via API officielle]';

    try {
      const result = await this.sendViaOfficialApi(to, fallbackText);
      return {
        provider: result.provider,
        messageId: result.messageId,
        timestamp: result.timestamp,
      };
    } catch (error) {
      this.stats.messagesFailed++;
      throw new Error(
        'Image sending requires Baileys (WhatsApp Web). ' +
        'Please connect Baileys for image support.'
      );
    }
  }

  /**
   * Envoie une réaction (emoji) à un message
   */
  async sendReaction(to: string, messageId: string, emoji: string): Promise<void> {
    if (this.fallbackMode) {
      log.warn('Reactions not supported via official API');
      return;
    }

    try {
      const baileys = getBaileysService();
      if (baileys.isConnected()) {
        await baileys.sendReaction(to, messageId, emoji);
      }
    } catch (error) {
      log.warn('Failed to send reaction', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Marque un message comme lu (via Baileys)
   */
  async markAsRead(jid: string, messageId: string): Promise<void> {
    if (this.fallbackMode) return;
    try {
      const baileys = getBaileysService();
      await baileys.markAsRead(jid, messageId);
    } catch {}
  }

  /**
   * Envoie un message dans un groupe WhatsApp
   */
  async sendGroupMessage(groupJid: string, message: string): Promise<RouterSendMessageResult> {
    this.maybeResetFromFallback();

    if (!this.fallbackMode && this.activeProvider === 'baileys') {
      try {
        const baileys = getBaileysService();
        if (baileys.isConnected()) {
          const result = await baileys.sendGroupMessage(groupJid, message);
          this.onBaileysSuccess();
          this.stats.messagesSent++;
          return {
            provider: 'baileys',
            messageId: result.messageId,
            timestamp: result.timestamp,
          };
        }
      } catch (error) {
        this.onBaileysFailure(error);
      }
    }

    // Les groupes ne sont pas supportés par l'API officielle simplement
    throw new Error('Group messages require Baileys connection');
  }

  /**
   * Statut de connexion complet
   */
  getConnectionStatus(): WhatsAppRouterStatus {
    const baileys = getBaileysService();
    const baileysHealth = baileys.healthCheck();

    let officialApiAvailable = false;
    try {
      getWhatsAppClient();
      officialApiAvailable = true;
    } catch {}

    return {
      activeProvider: this.fallbackMode ? 'official' : this.activeProvider,
      baileysState: baileysHealth.state,
      baileysQrRequired: baileysHealth.qrRequired,
      baileysQrCode: baileys.getQRCode(),
      baileysPhone: baileys.getConnectedPhone(),
      officialApiAvailable,
      lastActivity: baileysHealth.lastActivity,
      fallbackMode: this.fallbackMode,
      consecutiveBaileysFailures: this.consecutiveBaileysFailures,
      fallbackRetryAt: this.fallbackRetryAt?.toISOString() ?? null,
      messagesSent: this.stats.messagesSent,
      messagesFailed: this.stats.messagesFailed,
    };
  }

  /**
   * Passe en mode fallback (API officielle) manuellement
   */
  forceFallback(): void {
    log.info('Manually switching to official WhatsApp API fallback');
    this.fallbackMode = true;
    this.activeProvider = 'official';
    this.lastProviderSwitch = new Date();
    this.fallbackRetryAt = new Date(Date.now() + this.fallbackDurationMs);
    this.scheduleFallbackRetry();
  }

  /**
   * Tente de revenir à Baileys
   */
  async resetToPrimary(): Promise<boolean> {
    log.info('Attempting to switch back to Baileys as primary provider');

    try {
      const baileys = getBaileysService();
      if (!baileys.isConnected()) {
        await baileys.connect();
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      if (baileys.isConnected()) {
        this.fallbackMode = false;
        this.activeProvider = 'baileys';
        this.consecutiveBaileysFailures = 0;
        this.fallbackRetryAt = null;
        this.lastProviderSwitch = new Date();

        if (this.retryTimer) {
          clearTimeout(this.retryTimer);
          this.retryTimer = null;
        }

        log.info('Successfully switched back to Baileys', {
          phone: baileys.getConnectedPhone(),
        });
        return true;
      }

      return false;
    } catch (error) {
      log.error('Failed to reset to Baileys', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async initBaileys(): Promise<void> {
    const baileys = getBaileysService();
    await baileys.connect();
    await registerBaileysAutoResponder();
    log.info('Baileys WhatsApp service initialized with auto-responder (10s delay)');
  }

  private onBaileysSuccess(): void {
    if (this.consecutiveBaileysFailures > 0) {
      log.info('Baileys recovered after failures', {
        previousFailures: this.consecutiveBaileysFailures,
      });
    }
    this.consecutiveBaileysFailures = 0;
  }

  private onBaileysFailure(error: unknown): void {
    this.consecutiveBaileysFailures++;
    this.stats.messagesFailed++;

    if (this.consecutiveBaileysFailures >= this.maxConsecutiveFailures) {
      log.error('Baileys failed too many times, switching to fallback mode', {
        failures: this.consecutiveBaileysFailures,
      });
      this.forceFallback();
    }
  }

  private maybeResetFromFallback(): void {
    if (!this.fallbackMode) return;
    if (this.fallbackRetryAt && new Date() >= this.fallbackRetryAt) {
      this.resetToPrimary().catch((err) => {
        log.warn('Auto-reset to Baileys failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }
  }

  private scheduleFallbackRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.resetToPrimary().catch(() => {});
    }, this.fallbackDurationMs);
  }

  private async sendViaOfficialApi(to: string, message: string): Promise<RouterSendMessageResult> {
    try {
      const client = getWhatsAppClient();
      const result: WhatsAppMessageResponse = await client.sendMessage(to, message);
      this.stats.messagesSent++;
      return {
        provider: 'official',
        messageId: result.messageId,
        recipientWaId: result.recipientWaId,
      };
    } catch (error) {
      this.stats.messagesFailed++;
      log.error('Official WhatsApp API also failed', {
        to,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _router: WhatsAppRouter | null = null;

export function getWhatsAppRouter(): WhatsAppRouter {
  if (!_router) {
    _router = new WhatsAppRouter();
  }
  return _router;
}

export { WhatsAppRouter };
