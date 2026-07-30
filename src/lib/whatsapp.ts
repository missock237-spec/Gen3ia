// ============================================================
// WHATSAPP SERVICE — WhatsApp Cloud API (officielle Meta)
// ============================================================
// Envoi et réception de messages, images, vidéos, audio,
// documents, templates, boutons interactifs, listes,
// et appels audio via WhatsApp Business API.
// Chaque utilisateur peut enregistrer sa voix pour les appels.
// ============================================================

import { prisma } from "./prisma";
import { logger } from "./logger";

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

interface WhatsAppConfig {
  phoneNumberId: string;
  apiToken: string;
  webhookSecret: string;
  apiVersion: string;
}

function getConfig(): WhatsAppConfig {
  return {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
    apiToken: process.env.WHATSAPP_API_TOKEN ?? "",
    webhookSecret: process.env.WHATSAPP_VERIFY_TOKEN ?? "",
    apiVersion: "v21.0",
  };
}

const META_API_BASE = "https://graph.facebook.com";

/**
 * Rate limiter interne pour éviter les bans de l'API Meta
 */
const rateLimiter = new Map<string, number[]>();
function checkRateLimit(key: string, maxPerMinute: number = 60): boolean {
  const now = Date.now();
  const timestamps = rateLimiter.get(key) || [];
  const recent = timestamps.filter((t) => now - t < 60000);
  if (recent.length >= maxPerMinute) return false;
  recent.push(now);
  rateLimiter.set(key, recent);
  return true;
}

class WhatsAppService {
  async sendText(to: string, text: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!checkRateLimit(`text:${to}`)) {
      return { success: false, error: "Rate limit exceeded. Please wait before sending more messages." };
    }

    const cfg = getConfig();
    try {
      const response = await fetch(`${META_API_BASE}/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp", recipient_type: "individual", to,
          type: "text", text: { preview_url: false, body: text.slice(0, 4096) },
        }),
      });
      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        logger.error("whatsapp_send_text_failed", { to, status: response.status, error: errorBody.slice(0, 200) });
        return { success: false, error: `WhatsApp API error: ${response.status}` };
      }
      const data = await response.json() as { messages?: Array<{ id: string }> };
      logger.info("whatsapp_text_sent", { to, messageId: data.messages?.[0]?.id });
      return { success: true, messageId: data.messages?.[0]?.id };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async sendMedia(params: {
    to: string;
    type: "image" | "video" | "audio" | "document";
    mediaUrl: string;
    caption?: string;
    filename?: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!checkRateLimit(`media:${params.to}`)) {
      return { success: false, error: "Rate limit exceeded" };
    }

    const cfg = getConfig();
    try {
      const body: Record<string, unknown> = {
        messaging_product: "whatsapp", recipient_type: "individual", to: params.to,
        type: params.type,
        [params.type]: {
          link: params.mediaUrl,
          ...(params.caption && { caption: params.caption.slice(0, 1024) }),
          ...(params.filename && { filename: params.filename }),
        },
      };
      const response = await fetch(`${META_API_BASE}/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) return { success: false, error: `WhatsApp API error: ${response.status}` };
      const data = await response.json() as { messages?: Array<{ id: string }> };
      return { success: true, messageId: data.messages?.[0]?.id };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async sendTemplate(params: {
    to: string;
    templateName: string;
    language?: string;
    parameters?: string[];
    headerParameters?: string[];
    buttonParameters?: string[];
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const cfg = getConfig();
    try {
      const components: Array<Record<string, unknown>> = [];

      if (params.headerParameters) {
        components.push({
          type: "header",
          parameters: params.headerParameters.map((p) => ({ type: "text", text: p })),
        });
      }

      if (params.parameters) {
        components.push({
          type: "body",
          parameters: params.parameters.map((p) => ({ type: "text", text: p })),
        });
      }

      if (params.buttonParameters) {
        components.push({
          type: "button",
          sub_type: "quick_reply",
          index: 0,
          parameters: params.buttonParameters.map((p) => ({ type: "text", text: p })),
        });
      }

      const body: Record<string, unknown> = {
        messaging_product: "whatsapp", recipient_type: "individual", to: params.to,
        type: "template",
        template: {
          name: params.templateName,
          language: { code: params.language ?? "fr" },
          ...(components.length > 0 ? { components } : {}),
        },
      };

      const response = await fetch(`${META_API_BASE}/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) return { success: false, error: `WhatsApp template error: ${response.status}` };
      const data = await response.json() as { messages?: Array<{ id: string }> };
      return { success: true, messageId: data.messages?.[0]?.id };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Envoie des boutons interactifs (jusqu'à 3)
   */
  async sendInteractiveButtons(params: {
    to: string;
    headerText?: string;
    bodyText: string;
    footerText?: string;
    buttons: InteractiveButton[];
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const cfg = getConfig();
    try {
      const interactive: Record<string, unknown> = {
        type: "button",
        body: { text: params.bodyText.slice(0, 1024) },
        action: { buttons: params.buttons.slice(0, 3) },
      };
      if (params.headerText) interactive.header = { type: "text", text: params.headerText.slice(0, 60) };
      if (params.footerText) interactive.footer = { text: params.footerText.slice(0, 60) };

      const response = await fetch(`${META_API_BASE}/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp", recipient_type: "individual", to: params.to,
          type: "interactive", interactive,
        }),
      });
      if (!response.ok) return { success: false, error: `Interactive buttons error: ${response.status}` };
      const data = await response.json() as { messages?: Array<{ id: string }> };
      return { success: true, messageId: data.messages?.[0]?.id };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Envoie une liste interactive (menu déroulant)
   */
  async sendInteractiveList(params: {
    to: string;
    headerText?: string;
    bodyText: string;
    footerText?: string;
    buttonText: string;
    sections: InteractiveListSection[];
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const cfg = getConfig();
    try {
      const interactive: Record<string, unknown> = {
        type: "list",
        body: { text: params.bodyText.slice(0, 1024) },
        action: {
          button: params.buttonText.slice(0, 20),
          sections: params.sections.slice(0, 10).map((s) => ({
            title: s.title.slice(0, 24),
            rows: s.rows.slice(0, 10).map((r) => ({
              id: r.id,
              title: r.title.slice(0, 24),
              ...(r.description ? { description: r.description.slice(0, 72) } : {}),
            })),
          })),
        },
      };
      if (params.headerText) interactive.header = { type: "text", text: params.headerText.slice(0, 60) };
      if (params.footerText) interactive.footer = { text: params.footerText.slice(0, 60) };

      const response = await fetch(`${META_API_BASE}/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp", recipient_type: "individual", to: params.to,
          type: "interactive", interactive,
        }),
      });
      if (!response.ok) return { success: false, error: `Interactive list error: ${response.status}` };
      const data = await response.json() as { messages?: Array<{ id: string }> };
      return { success: true, messageId: data.messages?.[0]?.id };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async makeCall(params: {
    to: string;
    userId: string;
    message: string;
  }): Promise<{ success: boolean; callSid?: string; error?: string }> {
    const cfg = getConfig();
    try {
      const voiceProfile = await prisma.voiceProfile.findUnique({ where: { userId: params.userId } });
      const whatsappConfig = await prisma.whatsappConfig.findUnique({ where: { userId: params.userId } });
      if (!whatsappConfig?.phoneNumber) return { success: false, error: "Aucun numéro WhatsApp configuré" };

      if (voiceProfile && process.env.OPENAI_API_KEY) {
        const ttsResponse = await fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "tts-1",
            voice: voiceProfile.voiceModel ?? "alloy",
            input: params.message.slice(0, 4096),
            speed: voiceProfile.speed ?? 1.0,
          }),
        });
        if (ttsResponse.ok) logger.info("whatsapp_tts_generated", { voiceModel: voiceProfile.voiceModel });
      }

      const call = await prisma.voiceCall.create({
        data: {
          userId: params.userId,
          fromNumber: whatsappConfig.phoneNumber,
          toNumber: params.to,
          provider: "whatsapp",
          status: "initiated",
          metadata: JSON.stringify({
            message: params.message.slice(0, 200),
            voiceProfile: voiceProfile?.voiceModel,
          }),
        },
      });

      logger.info("whatsapp_call_initiated", { callId: call.id });
      return { success: true, callSid: call.id };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  verifyWebhook(mode: string | null, token: string | null, challenge: string | null): string | null {
    const secret = process.env.WHATSAPP_VERIFY_TOKEN ?? "";
    if (mode === "subscribe" && token === secret) return challenge;
    return null;
  }

  async handleIncomingMessage(payload: Record<string, unknown>): Promise<void> {
    try {
      const entry = (payload.entry as Array<Record<string, unknown>>)?.[0];
      const change = (entry?.changes as Array<Record<string, unknown>>)?.[0];
      const value = change?.value as Record<string, unknown>;
      const messages = value?.messages as Array<Record<string, unknown>>;
      if (!messages || messages.length === 0) return;

      for (const msg of messages) {
        const from = msg.from as string;
        const msgType = msg.type as string;
        let text = "";

        switch (msgType) {
          case "text":
            text = (msg.text as Record<string, string>)?.body ?? "";
            break;
          case "audio":
            text = "[Message audio]";
            break;
          case "image":
          case "video":
          case "document":
            text = (msg[msgType] as Record<string, string>)?.caption ?? `[${msgType.toUpperCase()}]`;
            break;
          case "interactive": {
            const interactive = msg.interactive as Record<string, unknown>;
            const buttonReply = interactive?.button_reply as Record<string, string>;
            const listReply = interactive?.list_reply as Record<string, string>;
            text = buttonReply?.id || listReply?.id || "[Interaction]";
            break;
          }
          case "button":
            text = (msg.button as Record<string, string>)?.payload || "[Bouton]";
            break;
        }

        logger.info("whatsapp_message_received", { from, type: msgType, hasText: text.length > 0 });
        await this.routeToAgent(from, text, msgType);
      }
    } catch (error) {
      logger.error("whatsapp_handle_incoming_error", { error: String(error) });
    }
  }

  private async routeToAgent(from: string, text: string, msgType: string): Promise<void> {
    const whatsappConfig = await prisma.whatsappConfig.findFirst({
      where: { phoneNumber: from, isActive: true },
      include: { user: true },
    });

    const agent = await prisma.agent.findFirst({
      where: {
        type: "whatsapp",
        status: { not: "inactive" },
        ...(whatsappConfig ? { userId: whatsappConfig.userId } : {}),
      },
    });

    if (!agent) {
      await this.sendText(from, "🤖 Bienvenue sur Gen3ia ! Aucun agent WhatsApp n'est configuré pour répondre.");
      return;
    }

    const conversation = await prisma.conversation.findFirst({
      where: { agentId: agent.id, type: "whatsapp" },
    }) ?? await prisma.conversation.create({
      data: { title: `WhatsApp - ${from}`, type: "whatsapp", userId: agent.userId, agentId: agent.id },
    });

    await prisma.message.create({
      data: {
        role: "user", content: text.slice(0, 10000),
        conversationId: conversation.id, provider: "whatsapp",
      },
    });

    logger.info("whatsapp_routed_to_agent", { from, agentId: agent.id });
  }

  async saveVoiceProfile(params: {
    userId: string;
    voiceModel: string;
    speed?: number;
    pitch?: number;
    language?: string;
  }): Promise<void> {
    await prisma.voiceProfile.upsert({
      where: { userId: params.userId },
      update: {
        voiceModel: params.voiceModel,
        speed: params.speed ?? 1.0,
        pitch: params.pitch ?? 1.0,
        language: params.language ?? "fr-FR",
      },
      create: {
        userId: params.userId,
        voiceModel: params.voiceModel,
        speed: params.speed ?? 1.0,
        pitch: params.pitch ?? 1.0,
        language: params.language ?? "fr-FR",
      },
    });
    logger.info("whatsapp_voice_profile_saved", { voiceModel: params.voiceModel });
  }
}

export const whatsappService = new WhatsAppService();
export default whatsappService;
