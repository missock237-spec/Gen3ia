// ============================================================
// WHATSAPP SERVICE — Intégration retirée du projet Gen3ia.
// Module neutralisé : aucune dépendance externe, aucun appel API,
// aucun accès Prisma (les modèles WhatsAppConfig/VoiceProfile ont été supprimés).
// L'API publique est conservée pour ne pas casser les importateurs.
// ============================================================

export type MessageType = "text" | "image" | "video" | "audio" | "document" | "template" | "interactive";

export interface InteractiveButton {
  type: "reply";
  reply: {
    id: string;
    title: string;
  };
}

export interface InteractiveListSection {
  title: string;
  rows: Array<{ id: string; title: string; description?: string }>;
}

const DISABLED_ERROR = "WhatsApp a été retiré du projet Gen3ia";

class WhatsAppService {
  async sendText(_to: string, _text: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    return { success: false, error: DISABLED_ERROR };
  }

  async sendMedia(_params: {
    to: string;
    type: "image" | "video" | "audio" | "document";
    mediaUrl: string;
    caption?: string;
    filename?: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    return { success: false, error: DISABLED_ERROR };
  }

  async sendTemplate(_params: {
    to: string;
    templateName: string;
    language?: string;
    parameters?: string[];
    headerParameters?: string[];
    buttonParameters?: string[];
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    return { success: false, error: DISABLED_ERROR };
  }

  async sendInteractiveButtons(_params: {
    to: string;
    headerText?: string;
    bodyText: string;
    footerText?: string;
    buttons: InteractiveButton[];
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    return { success: false, error: DISABLED_ERROR };
  }

  async sendInteractiveList(_params: {
    to: string;
    headerText?: string;
    bodyText: string;
    footerText?: string;
    buttonText: string;
    sections: InteractiveListSection[];
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    return { success: false, error: DISABLED_ERROR };
  }

  async makeCall(_params: {
    to: string;
    userId: string;
    message: string;
  }): Promise<{ success: boolean; callSid?: string; error?: string }> {
    return { success: false, error: DISABLED_ERROR };
  }

  verifyWebhook(_mode: string | null, _token: string | null, _challenge: string | null): string | null {
    return null;
  }

  async handleIncomingMessage(_payload: Record<string, unknown>): Promise<void> {
    // Intégration retirée
  }

  async saveVoiceProfile(_params: {
    userId: string;
    voiceModel: string;
    speed?: number;
    pitch?: number;
    language?: string;
  }): Promise<void> {
    // Intégration retirée
  }
}

export const whatsappService = new WhatsAppService();
export default whatsappService;
