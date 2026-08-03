/**
 * WhatsApp — Intégration retirée du projet Gen3ia.
 * Barrel conservé pour compatibilité : exports neutres.
 */

export const whatsappClient = {
  sendMessage: async (_to: string, _text: string): Promise<{ success: boolean; messageId?: string; error?: string }> => {
    return { success: false, error: 'WhatsApp a été retiré du projet Gen3ia' };
  },
};

export interface WhatsAppMessage {
  id: string;
  from: string;
  text: string;
  timestamp: number;
}

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export type WhatsAppTextMessage = {
  type: 'text';
  body: string;
};

export type WhatsAppTemplateMessage = {
  type: 'template';
  name: string;
  language: string;
};

export type WhatsAppInteractiveMessage = {
  type: 'interactive';
  body: string;
  buttons: Array<{ id: string; title: string }>;
};
