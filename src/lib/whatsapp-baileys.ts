/**
 * WhatsApp (Baileys) — Intégration retirée du projet Gen3ia.
 * Module neutralisé : aucune dépendance externe, aucune connexion WhatsApp.
 * L'API publique est conservée pour ne pas casser les importateurs existants.
 */

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

export type MediaType = 'image' | 'video' | 'audio' | 'document';

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

const DISABLED_MSG = 'WhatsApp (Baileys) a été retiré du projet Gen3ia';

export class BaileysWhatsAppService {
  private messageHandlers: BaileysMessageHandler[] = [];

  async connect(): Promise<void> {
    // Intégration retirée — aucune connexion démarrée
  }

  async disconnect(): Promise<void> {
    this.messageHandlers = [];
  }

  isConnected(): boolean {
    return false;
  }

  async sendMessage(_to: string, _message: string): Promise<BaileysSendMessageResult> {
    throw new Error(DISABLED_MSG);
  }

  async sendMessageWithTyping(
    _to: string,
    _message: string,
    _typingDurationMs?: number
  ): Promise<BaileysSendMessageResult> {
    throw new Error(DISABLED_MSG);
  }

  async sendImage(
    _to: string,
    _imageBuffer: Buffer,
    _caption?: string
  ): Promise<BaileysSendImageResult> {
    throw new Error(DISABLED_MSG);
  }

  async sendAudio(
    _to: string,
    _audioBuffer: Buffer,
    _ptt?: boolean
  ): Promise<BaileysSendAudioResult> {
    throw new Error(DISABLED_MSG);
  }

  async sendReaction(
    _to: string,
    _messageId: string,
    _emoji: string
  ): Promise<BaileysSendReactionResult> {
    throw new Error(DISABLED_MSG);
  }

  async sendGroupMessage(_groupJid: string, _message: string): Promise<BaileysSendMessageResult> {
    throw new Error(DISABLED_MSG);
  }

  async markAsRead(_jid: string, _messageId: string): Promise<void> {
    // Intégration retirée
  }

  getQRCode(): string | null {
    return null;
  }

  getConnectionState(): BaileysConnectionState {
    return 'disconnected';
  }

  getConnectedPhone(): string | null {
    return null;
  }

  getConnectedPushName(): string | null {
    return null;
  }

  getLastActivity(): Date | null {
    return null;
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
      healthy: false,
      state: 'disconnected',
      qrRequired: false,
      lastActivity: null,
      connectedPhone: null,
    };
  }
}

let _instance: BaileysWhatsAppService | null = null;

export function getBaileysService(): BaileysWhatsAppService {
  if (!_instance) {
    _instance = new BaileysWhatsAppService();
  }
  return _instance;
}
