/**
 * WhatsApp Auto-Responder — Intégration retirée du projet Gen3ia.
 * Module neutralisé : aucune dépendance externe, aucun accès base de données.
 * L'API publique est conservée pour ne pas casser les importateurs existants.
 */

const DISABLED_MSG = 'WhatsApp auto-responder a été retiré du projet Gen3ia';

export async function processIncomingWhatsAppMessage(
  _userId: string,
  _senderPhone: string,
  _messageText: string,
  _senderName?: string,
  _messageId?: string,
  _fromJid?: string,
  _isGroup?: boolean,
  _groupJid?: string
): Promise<void> {
  // Intégration retirée — aucune réponse automatique
}

export async function registerBaileysAutoResponder(): Promise<void> {
  // Intégration retirée — aucun enregistrement de handler
}

export async function handleWebhookIncomingMessage(
  _webhookData: {
    from: string;
    text: string;
    timestamp: number;
    messageId: string;
    senderName?: string;
  }
): Promise<void> {
  // Intégration retirée
}

export function getAutoResponderDisabledMessage(): string {
  return DISABLED_MSG;
}
