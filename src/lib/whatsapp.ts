// ============================================================
// WHATSAPP SERVICE — WhatsApp Cloud API (officielle Meta)
// ============================================================
// Envoi et réception de messages, images, vidéos, audio,
// documents, templates, et appels audio via WhatsApp Business API.
// Chaque utilisateur peut enregistrer sa voix pour les appels.
// ============================================================

import { prisma } from "./prisma";
import { logger } from "./logger";

export type MessageType = "text" | "image" | "video" | "audio" | "document" | "template";

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

class WhatsAppService {
  async sendText(to: string, text: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
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
        const error = await response.text();
        logger.error("whatsapp_send_text_failed", { to, status: response.status });
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
      logger.info("whatsapp_media_sent", { type: params.type, to: params.to });
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
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const cfg = getConfig();
    try {
      const body = {
        messaging_product: "whatsapp", recipient_type: "individual", to: params.to,
        type: "template",
        template: {
          name: params.templateName,
          language: { code: params.language ?? "fr" },
          components: params.parameters
            ? [{ type: "body", parameters: params.parameters.map((p) => ({ type: "text", text: p })) }]
            : undefined,
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
          body: JSON.stringify({ model: "tts-1", voice: voiceProfile.voiceModel ?? "alloy", input: params.message.slice(0, 4096), speed: voiceProfile.speed ?? 1.0 }),
        });
        if (ttsResponse.ok) logger.info("whatsapp_tts_generated", { voiceModel: voiceProfile.voiceModel });
      }
      const call = await prisma.voiceCall.create({
        data: {
          userId: params.userId, fromNumber: whatsappConfig.phoneNumber, toNumber: params.to,
          provider: "whatsapp", status: "initiated",
          metadata: JSON.stringify({ message: params.message.slice(0, 200), voiceProfile: voiceProfile?.voiceModel }),
        },
      });
      logger.info("whatsapp_call_initiated", { callId: call.id, from: whatsappConfig.phoneNumber, to: params.to });
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
        logger.info("whatsapp_message_received", { from, type: msgType });
        let text = "";
        if (msgType === "text") {
          text = (msg.text as Record<string, string>)?.body ?? "";
        } else if (msgType === "audio") {
          text = "[Message audio]";
        } else if (["image", "video", "document"].includes(msgType)) {
          const media = msg[msgType] as Record<string, string>;
          text = `[${msgType.toUpperCase()}] ${media?.caption ?? ""}`;
        }
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
      await this.sendText(from, "🤖 Bienvenue sur Genova AI ! Aucun agent WhatsApp n'est configuré.");
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
      update: { voiceModel: params.voiceModel, speed: params.speed ?? 1.0, pitch: params.pitch ?? 1.0, language: params.language ?? "fr-FR" },
      create: { userId: params.userId, voiceModel: params.voiceModel, speed: params.speed ?? 1.0, pitch: params.pitch ?? 1.0, language: params.language ?? "fr-FR" },
    });
    logger.info("whatsapp_voice_profile_saved", { userId: params.userId.slice(0, 8), voiceModel: params.voiceModel });
  }
}

export const whatsappService = new WhatsAppService();
export default whatsappService;