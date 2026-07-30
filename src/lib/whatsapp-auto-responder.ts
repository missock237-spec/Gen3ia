/**
 * WhatsApp Auto-Responder — Incoming message → AI agent pipeline
 *
 * When a client sends a WhatsApp message:
 * 1. The message is received via Baileys or webhook
 * 2. A 10-second delay is applied before the AI agent responds
 * 3. The AI agent generates a response using the agent's config
 * 4. The response is sent back via the WhatsApp router
 *
 * Nouveautés v2:
 * - Accusé de réception immédiat (réaction emoji)
 * - Marquage du message comme lu
 * - Simulation de frappe naturelle
 * - Support des groupes WhatsApp
 * - Support des messages interactifs (boutons, listes)
 */

import { createLogger } from '@/lib/logger';
import { getWhatsAppRouter } from '@/lib/whatsapp-router';
import { getBaileysService } from '@/lib/whatsapp-baileys';
import { createAIRouter } from '@/lib/ai-router';
import { db } from '@/lib/db';

const log = createLogger('whatsapp-auto-responder');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Délai avant réponse IA (10 secondes) */
const RESPONSE_DELAY_MS = 10_000;

/** Longueur max du message pour l'IA */
const MAX_MESSAGE_LENGTH = 4000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedBaileysMessage {
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
  raw?: unknown;
}

interface WebhookIncomingMessage {
  from: string;
  text: string;
  timestamp: number;
  messageId: string;
  senderName?: string;
}

// ---------------------------------------------------------------------------
// Auto-responder core
// ---------------------------------------------------------------------------

async function findAutoResponderConfig(userId: string) {
  const whatsappConfig = await db.whatsAppConfig.findFirst({
    where: { userId, isActive: true, autoMessage: true },
  });

  if (!whatsappConfig) return null;

  let agent = await db.agent.findFirst({
    where: { userId, type: 'whatsapp', status: 'active' },
  });

  if (!agent) {
    agent = await db.agent.findFirst({
      where: { userId, status: 'active' },
    });
  }

  if (!agent) return null;

  let agentConfig: Record<string, unknown> = {};
  try {
    agentConfig = JSON.parse(agent.config);
  } catch {}

  return { agentId: agent.id, agentName: agent.name, agentConfig, agentType: agent.type };
}

async function generateAIResponse(
  userId: string,
  agentId: string,
  agentName: string,
  agentConfig: Record<string, unknown>,
  agentType: string,
  incomingMessage: string,
  senderPhone: string,
  senderName?: string,
  isGroup: boolean = false,
): Promise<string> {
  const personality = (agentConfig as { personality?: string }).personality || 'helpful and professional';
  const instructions = (agentConfig as { instructions?: string }).instructions || '';

  const permissions = await db.agentPermission.findMany({
    where: { agentId, granted: true },
    select: { permission: true },
  });
  const grantedPermissions = permissions.map((p) => p.permission);

  const systemPrompt = `You are ${agentName}, an AI assistant responding to a WhatsApp message.
- Agent Type: ${agentType}
- Personality: ${personality}
${instructions ? `- Special Instructions: ${instructions}` : ''}

Your granted permissions: ${grantedPermissions.join(', ') || 'none'}

${isGroup
  ? 'IMPORTANT: This is a GROUP chat. Address the group naturally and avoid mentioning individual names unless asked.'
  : 'IMPORTANT: This is a PRIVATE chat.'}

RULES FOR WHATSAPP:
1. Keep responses concise (1-3 short paragraphs max)
2. Use a friendly, conversational tone
3. Do NOT mention you are an AI unless asked
4. Respond in the same language as the incoming message
5. Never share sensitive information or API keys
6. For greetings, respond warmly and ask how you can help

${senderName ? `The sender's name is ${senderName}.` : ''}

Respond to the following WhatsApp message:`;

  const router = createAIRouter(userId);
  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: incomingMessage },
  ];

  const response = await router.chat(messages, { model: 'fast' });

  // Journalisation
  await db.agentActionLog.create({
    data: {
      agentId,
      action: 'whatsapp_auto_response',
      details: JSON.stringify({
        from: senderPhone,
        messageLength: incomingMessage.length,
        responseLength: response.content.length,
        provider: response.provider,
        model: response.model,
        isGroup,
      }),
      userId,
      status: 'completed',
      result: 'Auto-response sent via WhatsApp',
      resolvedAt: new Date(),
    },
  });

  // Apprentissage (fire-and-forget)
  try {
    const { learnFromInteraction } = await import('@/lib/agent-memory');
    learnFromInteraction(agentId, userId, incomingMessage, response.content).catch(() => {});
  } catch {}

  return response.content;
}

export async function processIncomingWhatsAppMessage(
  userId: string,
  senderPhone: string,
  messageText: string,
  senderName?: string,
  messageId?: string,
  fromJid?: string,
  isGroup: boolean = false,
  groupJid?: string,
): Promise<void> {
  const startTime = Date.now();
  log.info('Incoming WhatsApp message', {
    from: senderPhone,
    messageLength: messageText.length,
    isGroup,
  });

  try {
    const config = await findAutoResponderConfig(userId);
    if (!config) return;

    const truncatedMessage = messageText.length > MAX_MESSAGE_LENGTH
      ? messageText.substring(0, MAX_MESSAGE_LENGTH) + '...'
      : messageText;

    // ÉTAPE 1 : Accusé de réception immédiat (réaction)
    if (messageId && fromJid) {
      try {
        const baileys = getBaileysService();
        if (baileys.isConnected()) {
          await baileys.sendReaction(fromJid, messageId, '👀');
        }
      } catch {
        // Réaction optionnelle
      }
    }

    // ═══════════════════════════════════════════════════════════
    // ÉTAPE 2 : Délai de 10 secondes (naturel + anti-spam)
    // ═══════════════════════════════════════════════════════════
    await new Promise((resolve) => setTimeout(resolve, RESPONSE_DELAY_MS));

    // ÉTAPE 3 : Génération réponse IA
    const aiResponse = await generateAIResponse(
      userId,
      config.agentId,
      config.agentName,
      config.agentConfig,
      config.agentType,
      truncatedMessage,
      senderPhone,
      senderName,
      isGroup,
    );

    // ÉTAPE 4 : Envoi avec simulation de frappe
    const target = isGroup && groupJid ? groupJid : senderPhone;
    const router = getWhatsAppRouter();
    const sendResult = await router.sendMessage(target, aiResponse);

    const totalDuration = Date.now() - startTime;
    log.info('WhatsApp auto-response sent', {
      from: senderPhone,
      provider: sendResult.provider,
      messageId: sendResult.messageId,
      totalDurationMs: totalDuration,
      delayMs: RESPONSE_DELAY_MS,
      responseLength: aiResponse.length,
      isGroup,
    });
  } catch (error) {
    log.error('Failed to process WhatsApp auto-response', {
      userId,
      from: senderPhone,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ---------------------------------------------------------------------------
// Baileys message handler
// ---------------------------------------------------------------------------

let _baileysHandlerRegistered = false;

export async function registerBaileysAutoResponder(): Promise<void> {
  if (_baileysHandlerRegistered) {
    log.info('Baileys auto-responder already registered');
    return;
  }

  const baileys = getBaileysService();

  baileys.onMessage(async (msg: unknown) => {
    try {
      const parsed = msg as ParsedBaileysMessage;

      if (!parsed || !parsed.from) return;

      const text = parsed.text;
      if (!text && !parsed.hasMedia) return;

      const messageContent = text || `[${parsed.mediaType || 'media'} received]`;

      log.info('Baileys incoming message', {
        from: parsed.from,
        hasText: !!text,
        isGroup: parsed.isGroup,
        hasMedia: parsed.hasMedia,
      });

      // Trouver tous les utilisateurs avec autoMessage activé
      const whatsappConfigs = await db.whatsAppConfig.findMany({
        where: { isActive: true, autoMessage: true },
        select: { userId: true },
      });

      for (const config of whatsappConfigs) {
        processIncomingWhatsAppMessage(
          config.userId,
          parsed.from,
          messageContent,
          parsed.senderName,
          parsed.messageId,
          parsed.fromJid,
          parsed.isGroup,
          parsed.groupJid,
        ).catch((err) => {
          log.error('Auto-responder error', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    } catch (error) {
      log.error('Baileys message handler error', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  _baileysHandlerRegistered = true;
  log.info('Baileys auto-responder registered with 10s delay + reaction feedback');
}

// ---------------------------------------------------------------------------
// Official API webhook handler
// ---------------------------------------------------------------------------

export async function handleWebhookIncomingMessage(
  webhookData: WebhookIncomingMessage,
): Promise<void> {
  const { from, text, messageId, senderName } = webhookData;

  log.info('Webhook incoming message', { from, messageId });

  const whatsappConfigs = await db.whatsAppConfig.findMany({
    where: { isActive: true, autoMessage: true },
    select: { userId: true },
  });

  for (const config of whatsappConfigs) {
    processIncomingWhatsAppMessage(
      config.userId,
      from,
      text,
      senderName,
      messageId,
      undefined,
      false,
    ).catch((err) => {
      log.error('Webhook auto-responder error', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
}
