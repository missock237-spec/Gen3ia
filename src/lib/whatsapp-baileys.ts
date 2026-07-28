/**
 * Baileys WhatsApp Web Client
 *
 * Provides a WhatsApp Web connection via Baileys (@whiskeysockets/baileys).
 * Connects via WebSocket, authenticates with QR code, and supports
 * sending text messages, images, documents, and voice notes.
 *
 * Session data is persisted to /data/baileys-sessions/
 */

import { createLogger } from '@/lib/logger';
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  type WASocket,
  type ConnectionState,
  type AuthenticationState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
} from '@whiskeysockets/baileys';
import type { ILogger } from '@whiskeysockets/baileys/lib/Utils/logger.js';
import { Boom } from '@hapi/boom';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { randomBytes } from 'crypto';

const log = createLogger('whatsapp-baileys');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BaileysConnectionState = 'disconnected' | 'connecting' | 'connected' | 'awaiting_qr';

export interface BaileysMessageHandler {
  (message: unknown): void;
}

export interface BaileysSendMessageResult {
  messageId: string;
  timestamp: number;
}

export interface BaileysSendImageResult {
  messageId: string;
  timestamp: number;
}

export interface BaileysSendAudioResult {
  messageId: string;
  timestamp: number;
}

export interface BaileysSendReactionResult {
  messageId: string;
}

/**
 * Types de médias supportés pour l'envoi
 */
export type MediaType = 'image' | 'video' | 'audio' | 'document';

/**
 * Message entrant parsé (utile pour les handlers)
 */
export interface ParsedIncomingMessage {
  from: string;
  fromJid: string;
  text: string | null;
  messageId: string;
  isGroup: boolean;
  groupName?: string;
  groupJid?: string;
  senderName?: string;
  pushName?: string;
  timestamp: number;
  hasMedia: boolean;
  mediaType?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SESSION_DIR = join(process.cwd(), 'data', 'baileys-sessions');

/**
 * Format a phone number for Baileys JID.
 * Strips leading '+' and ensures @s.whatsapp.net suffix.
 */
function formatJid(phone: string): string {
  let cleaned = phone.replace(/[\s\-().]/g, '');
  if (cleaned.startsWith('+')) cleaned = cleaned.substring(1);
  if (cleaned.endsWith('@s.whatsapp.net')) return cleaned;
  if (cleaned.endsWith('@g.us')) return cleaned;
  if (cleaned.endsWith('@broadcast')) return cleaned;
  return `${cleaned}@s.whatsapp.net`;
}

/**
 * Extrait le numéro de téléphone d'un JID.
 * "237612345678@s.whatsapp.net" → "237612345678"
 */
function extractPhoneFromJid(jid: string): string {
  return jid.split('@')[0];
}

/**
 * Crée un logger compatible Baileys
 */
function createBaileysLogger(): ILogger {
  const baileysLog = createLogger('baileys-internal');
  return {
    level: 'silent',
    child: () => createBaileysLogger(),
    trace: () => {},
    debug: (obj: unknown, msg?: string) => baileysLog.debug(msg ?? String(obj)),
    info: (obj: unknown, msg?: string) => baileysLog.info(msg ?? String(obj)),
    warn: (obj: unknown, msg?: string) => baileysLog.warn(msg ?? String(obj)),
    error: (obj: unknown, msg?: string) => baileysLog.error(msg ?? String(obj)),
  };
}

/**
 * Parse un message Baileys entrant en format structuré
 */
function parseIncomingMessage(msg: Record<string, unknown>): ParsedIncomingMessage | null {
  try {
    const key = msg.key as Record<string, unknown> | undefined;
    if (!key || key.fromMe) return null;

    const remoteJid = (key.remoteJid as string) || '';
    const isGroup = remoteJid.endsWith('@g.us');
    const fromJid = isGroup ? ((msg.participant as string) || remoteJid) : remoteJid;
    const from = extractPhoneFromJid(fromJid);
    const messageId = (key.id as string) || '';

    const messageObj = msg.message as Record<string, unknown> | undefined;
    let text: string | null = null;
    let hasMedia = false;
    let mediaType: string | undefined;

    if (messageObj) {
      if (messageObj.conversation) text = messageObj.conversation as string;
      else if ((messageObj.extendedTextMessage as Record<string, unknown>|undefined)?.text) {
        text = (messageObj.extendedTextMessage as Record<string, string>).text;
      }
      else if ((messageObj.imageMessage as Record<string, unknown>|undefined)?.caption) {
        text = (messageObj.imageMessage as Record<string, string>).caption;
        hasMedia = true; mediaType = 'image';
      }
      else if ((messageObj.videoMessage as Record<string, unknown>|undefined)?.caption) {
        text = (messageObj.videoMessage as Record<string, string>).caption;
        hasMedia = true; mediaType = 'video';
      }
      else if (messageObj.audioMessage) { hasMedia = true; mediaType = 'audio'; }
      else if (messageObj.documentMessage) {
        text = (messageObj.documentMessage as Record<string, string>).caption || null;
        hasMedia = true; mediaType = 'document';
      }
      else if (messageObj.buttonsResponseMessage) {
        const btnResponse = messageObj.buttonsResponseMessage as Record<string, unknown>;
        text = (btnResponse.selectedButtonId as string) || (btnResponse.selectedDisplayText as string) || null;
      }
      else if (messageObj.listResponseMessage) {
        const listResponse = messageObj.listResponseMessage as Record<string, unknown>;
        text = (listResponse.singleSelectReply as Record<string, string>|undefined)?.selectedRowId || null;
      }
    }

    if (!text && !hasMedia) return null;

    return {
      from,
      fromJid,
      text,
      messageId,
      isGroup,
      groupName: isGroup ? ((msg.pushName as string) || undefined) : undefined,
      groupJid: isGroup ? remoteJid : undefined,
      senderName: msg.pushName as string || undefined,
      pushName: msg.pushName as string || undefined,
      timestamp: (msg.messageTimestamp as number) || Date.now(),
      hasMedia,
      mediaType,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

class BaileysWhatsAppService {
  private sock: WASocket | null = null;
  private authState: { state: AuthenticationState; saveCreds: () => Promise<void> } | null = null;
  private connectionState: BaileysConnectionState = 'disconnected';
  private qrCode: string | null = null;
  private messageHandlers: BaileysMessageHandler[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastActivity: Date | null = null;
  private isShuttingDown = false;
  private connectedPhone: string | null = null;
  private connectedPushName: string | null = null;

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async connect(): Promise<void> {
    if (this.sock && this.connectionState === 'connected') {
      log.info('Already connected, skipping connect()');
      return;
    }

    this.isShuttingDown = false;
    this.connectionState = 'connecting';
    log.info('Starting Baileys WhatsApp connection...');

    try {
      await mkdir(SESSION_DIR, { recursive: true });

      this.authState = await useMultiFileAuthState(SESSION_DIR);
      const { version } = await fetchLatestBaileysVersion();

      log.info('Creating WhatsApp socket', { version: version.join('.') });

      this.sock = makeWASocket({
        version,
        auth: {
          creds: this.authState.state.creds,
          keys: makeCacheableSignalKeyStore(this.authState.state.keys, createBaileysLogger()),
        },
        logger: createBaileysLogger(),
        printQRInTerminal: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 30_000,
        defaultQueryTimeoutMs: 30_000,
        browser: Browsers.macOS('Chrome'), // Version propre au lieu de 'Genova Genova'
      });

      this.sock.ev.on('connection.update', this.handleConnectionUpdate.bind(this));
      this.sock.ev.on('creds.update', this.handleCredsUpdate.bind(this));
      this.sock.ev.on('messages.upsert', this.handleMessagesUpsert.bind(this));
      this.sock.ev.on('presence.update', this.handlePresenceUpdate.bind(this));
    } catch (error) {
      log.error('Failed to connect Baileys', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.connectionState = 'disconnected';
      this.scheduleReconnect();
    }
  }

  async disconnect(): Promise<void> {
    this.isShuttingDown = true;
    log.info('Disconnecting Baileys WhatsApp...');

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.sock) {
      try {
        // Envoi d'une présence hors ligne avant déconnexion
        await this.sock.sendPresenceUpdate('unavailable');
        this.sock.end(undefined);
      } catch {}
      this.sock = null;
    }

    this.connectionState = 'disconnected';
    this.qrCode = null;
    this.connectedPhone = null;
    this.connectedPushName = null;
    this.reconnectAttempts = 0;
  }

  isConnected(): boolean {
    return this.connectionState === 'connected' && this.sock !== null;
  }

  /**
   * Envoie un message texte
   */
  async sendMessage(to: string, message: string): Promise<BaileysSendMessageResult> {
    if (!this.isConnected() || !this.sock) {
      throw new Error('Baileys WhatsApp is not connected');
    }

    const jid = formatJid(to);
    log.info('Sending text message via Baileys', { to: extractPhoneFromJid(jid), messageLength: message.length });

    try {
      // Simulation de frappe avant envoi
      await this.sock.sendPresenceUpdate('composing', jid);

      const sent = await this.sock.sendMessage(jid, { text: message });
      this.lastActivity = new Date();

      // Arrêt de la simulation de frappe
      await this.sock.sendPresenceUpdate('paused', jid);

      const messageId = sent?.key?.id ?? randomBytes(16).toString('hex');
      const timestamp = typeof sent?.messageTimestamp === 'number'
        ? sent.messageTimestamp
        : Math.floor(Date.now() / 1000);

      log.info('Message sent via Baileys', { messageId });
      return { messageId, timestamp };
    } catch (error) {
      log.error('Failed to send message via Baileys', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Envoie un message avec accusé de lecture simulé
   */
  async sendMessageWithTyping(to: string, message: string, typingDurationMs: number = 1000): Promise<BaileysSendMessageResult> {
    if (!this.isConnected() || !this.sock) {
      throw new Error('Baileys WhatsApp is not connected');
    }

    const jid = formatJid(to);

    // Simulation de frappe pour un rendu naturel
    await this.sock.sendPresenceUpdate('composing', jid);
    await new Promise((resolve) => setTimeout(resolve, typingDurationMs));

    const result = await this.sendMessage(to, message);

    return result;
  }

  /**
   * Envoie une image
   */
  async sendImage(to: string, imageBuffer: Buffer, caption?: string): Promise<BaileysSendImageResult> {
    if (!this.isConnected() || !this.sock) {
      throw new Error('Baileys WhatsApp is not connected');
    }

    const jid = formatJid(to);
    log.info('Sending image via Baileys', { caption: caption ? 'provided' : 'none' });

    try {
      const sent = await this.sock.sendMessage(jid, {
        image: imageBuffer,
        caption: caption ?? undefined,
      });
      this.lastActivity = new Date();

      const messageId = sent?.key?.id ?? randomBytes(16).toString('hex');
      const timestamp = typeof sent?.messageTimestamp === 'number'
        ? sent.messageTimestamp
        : Math.floor(Date.now() / 1000);

      return { messageId, timestamp };
    } catch (error) {
      log.error('Failed to send image via Baileys', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Envoie un message audio (voice note)
   */
  async sendAudio(to: string, audioBuffer: Buffer, ptt: boolean = true): Promise<BaileysSendAudioResult> {
    if (!this.isConnected() || !this.sock) {
      throw new Error('Baileys WhatsApp is not connected');
    }

    const jid = formatJid(to);
    log.info('Sending audio via Baileys', { ptt });

    try {
      const sent = await this.sock.sendMessage(jid, {
        audio: audioBuffer,
        mimetype: ptt ? 'audio/ogg; codecs=opus' : 'audio/mp4',
        ptt,
      });
      this.lastActivity = new Date();

      const messageId = sent?.key?.id ?? randomBytes(16).toString('hex');
      const timestamp = typeof sent?.messageTimestamp === 'number'
        ? sent.messageTimestamp
        : Math.floor(Date.now() / 1000);

      return { messageId, timestamp };
    } catch (error) {
      log.error('Failed to send audio via Baileys', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Envoie une réaction à un message
   */
  async sendReaction(to: string, messageId: string, emoji: string): Promise<BaileysSendReactionResult> {
    if (!this.isConnected() || !this.sock) {
      throw new Error('Baileys WhatsApp is not connected');
    }

    const jid = formatJid(to);
    const reactionKey = { remoteJid: jid, fromMe: true, id: messageId };

    try {
      const sent = await this.sock.sendMessage(jid, {
        react: { key: reactionKey, text: emoji },
      });

      return { messageId: sent?.key?.id ?? randomBytes(16).toString('hex') };
    } catch (error) {
      log.error('Failed to send reaction via Baileys', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Envoie un message dans un groupe
   */
  async sendGroupMessage(groupJid: string, message: string): Promise<BaileysSendMessageResult> {
    return this.sendMessage(groupJid, message);
  }

  /**
   * Marque un message comme lu
   */
  async markAsRead(jid: string, messageId: string): Promise<void> {
    if (!this.sock) return;
    try {
      const key = {
        remoteJid: jid,
        id: messageId,
        fromMe: false,
      };
      await this.sock.readMessages([key]);
    } catch (error) {
      log.warn('Failed to mark message as read', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  getQRCode(): string | null {
    return this.qrCode;
  }

  getConnectionState(): BaileysConnectionState {
    return this.connectionState;
  }

  getConnectedPhone(): string | null {
    return this.connectedPhone;
  }

  getConnectedPushName(): string | null {
    return this.connectedPushName;
  }

  getLastActivity(): Date | null {
    return this.lastActivity;
  }

  onMessage(callback: BaileysMessageHandler): void {
    this.messageHandlers.push(callback);
  }

  offMessage(callback: BaileysMessageHandler): void {
    this.messageHandlers = this.messageHandlers.filter((h) => h !== callback);
  }

  healthCheck(): {
    healthy: boolean;
    state: BaileysConnectionState;
    qrRequired: boolean;
    lastActivity: string | null;
    connectedPhone: string | null;
  } {
    return {
      healthy: this.isConnected(),
      state: this.connectionState,
      qrRequired: this.connectionState === 'awaiting_qr',
      lastActivity: this.lastActivity?.toISOString() ?? null,
      connectedPhone: this.connectedPhone,
    };
  }

  // ---------------------------------------------------------------------------
  // Private handlers
  // ---------------------------------------------------------------------------

  private handleConnectionUpdate(update: Partial<ConnectionState>): void {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      this.qrCode = qr;
      this.connectionState = 'awaiting_qr';
      log.info('QR code received. Scan with WhatsApp to authenticate.');
    }

    if (connection === 'open') {
      this.connectionState = 'connected';
      this.qrCode = null;
      this.reconnectAttempts = 0;
      this.lastActivity = new Date();

      // Récupération des infos de connexion
      if (this.authState?.state.creds?.me?.id) {
        this.connectedPhone = this.authState.state.creds.me.id.split(':')[0];
        this.connectedPushName = this.authState.state.creds.me.name || null;
      }

      log.info('WhatsApp connected successfully via Baileys', {
        phone: this.connectedPhone ? `${this.connectedPhone.slice(0, 5)}...` : 'unknown',
        pushName: this.connectedPushName,
      });
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect =
        statusCode !== DisconnectReason.loggedOut &&
        statusCode !== DisconnectReason.forbidden &&
        !this.isShuttingDown;

      this.connectionState = 'disconnected';
      this.sock = null;
      this.qrCode = null;

      log.warn('WhatsApp connection closed', {
        statusCode,
        shouldReconnect,
      });

      if (shouldReconnect) {
        this.scheduleReconnect();
      } else if (statusCode === DisconnectReason.loggedOut) {
        log.error('WhatsApp logged out. Session invalidated. Re-scan QR code required.');
        this.connectedPhone = null;
        this.connectedPushName = null;
      }
    }
  }

  private async handleCredsUpdate(): Promise<void> {
    if (this.authState) {
      try {
        await this.authState.saveCreds();
      } catch (error) {
        log.error('Failed to save Baileys credentials', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private handleMessagesUpsert(upsert: { messages: unknown[]; type: string }): void {
    if (upsert.type === 'notify') {
      for (const msg of upsert.messages) {
        const parsed = parseIncomingMessage(msg as Record<string, unknown>);

        if (parsed) {
          log.debug('Incoming message parsed', {
            from: parsed.from,
            hasText: !!parsed.text,
            isGroup: parsed.isGroup,
            hasMedia: parsed.hasMedia,
          });

          // Notifier les handlers avec le message parsé
          for (const handler of this.messageHandlers) {
            try {
              handler({ ...parsed, raw: msg });
            } catch (error) {
              log.error('Message handler error', {
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        }
      }
    }
  }

  private handlePresenceUpdate(update: unknown): void {
    // Gestion des mises à jour de présence (optionnel)
  }

  private scheduleReconnect(): void {
    if (this.isShuttingDown) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      log.error('Max reconnect attempts reached. Giving up.', {
        attempts: this.reconnectAttempts,
      });
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(5000 * Math.pow(1.5, this.reconnectAttempts - 1), 60_000);

    log.info('Scheduling Baileys reconnect', {
      attempt: this.reconnectAttempts,
      delayMs: delay,
    });

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

let _instance: BaileysWhatsAppService | null = null;

export function getBaileysService(): BaileysWhatsAppService {
  if (!_instance) {
    _instance = new BaileysWhatsAppService();
  }
  return _instance;
}

export { BaileysWhatsAppService };
