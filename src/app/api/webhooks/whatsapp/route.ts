// ============================================================
// POST /api/webhooks/whatsapp — Webhook WhatsApp entrant
// Recu les messages WhatsApp via Twilio/Meta Cloud API
// Les achemine vers l'agent WhatsApp correspondant
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { createAIRouter } from '@/lib/ai-router';
import { embeddingService } from '@/lib/agent/embedding';
import { audioGenerator } from '@/lib/audio-generator';





export const dynamic = "force-dynamic";
const log = createLogger('whatsapp-webhook');

const WHATSAPP_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'genova_whatsapp_verify';
const MAX_MESSAGE_LENGTH = 4000;

/**
 * GET — Verification du webhook (Meta/WhatsApp requiert)
 */
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('hub.mode');
  const token = request.nextUrl.searchParams.get('hub.verify_token');
  const challenge = request.nextUrl.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === WHATSAPP_TOKEN && challenge) {
    log.info('whatsapp_webhook_verified');
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse('Verification failed', { status: 403 });
}

/**
 * POST — Message WhatsApp entrant
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Meta WhatsApp Cloud API format
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const messages = value?.messages;
    const contacts = value?.contacts;

    if (!messages || messages.length === 0) {
      // Status update, ignore
      return NextResponse.json({ success: true });
    }

    const msg = messages[0];
    const from = msg.from; // Phone number
    const contactName = contacts?.[0]?.profile?.name || from;

    // Recuperer ou creer l'utilisateur WhatsApp
    let user = await db.user.findFirst({
      where: { phone: from },
      select: { id: true, credits: true },
    });

    if (!user) {
      // Creer un user temporaire
      user = await db.user.create({
        data: {
          phone: from,
          name: contactName,
          credits: 100, // Credits de bienvenue
          role: 'user',
        },
        select: { id: true, credits: true },
      });
      log.info('whatsapp_user_created', { phone: from });
    }

    // Trouver l'agent WhatsApp de l'utilisateur
    let agent = await db.agent.findFirst({
      where: { userId: user.id, type: 'whatsapp', status: 'active' },
      select: { id: true, name: true },
    });

    if (!agent) {
      // Creer un agent WhatsApp par defaut
      agent = await db.agent.create({
        data: {
          name: 'Assistant WhatsApp',
          type: 'whatsapp',
          description: 'Agent WhatsApp automatique',
          userId: user.id,
          status: 'active',
          config: JSON.stringify({ autoReply: true }),
        },
        select: { id: true, name: true },
      });

      // Permissions par defaut
      const defaultPerms = [
        { permission: 'whatsapp_message', granted: true, requiresApproval: false, agentId: agent.id, userId: user.id },
        { permission: 'whatsapp_call', granted: false, requiresApproval: true, agentId: agent.id, userId: user.id },
        { permission: 'use_api', granted: true, requiresApproval: false, agentId: agent.id, userId: user.id },
      ];
      await db.agentPermission.createMany({ data: defaultPerms });
    }

    let userMessage: string;
    let responseType: 'text' | 'audio' = 'text';

    // Gestion du type de message
    if (msg.type === 'text') {
      userMessage = (msg.text?.body || '').slice(0, MAX_MESSAGE_LENGTH);
    } else if (msg.type === 'audio' || msg.type === 'voice') {
      // Message vocal → transcrire
      const audioId = msg.audio?.id || msg.voice?.id;
      userMessage = `[Message vocal recu, ID: ${audioId || 'inconnu'}]`;
      responseType = 'audio';
    } else if (msg.type === 'interactive') {
      userMessage = msg.interactive?.button_reply?.title ||
        msg.interactive?.list_reply?.title ||
        'Interaction recue';
    } else {
      userMessage = `Message de type ${msg.type} recu`;
    }

    // Verifier les credits
    if ((user.credits || 0) < 1) {
      log.warn('whatsapp_no_credits', { phone: from });
      return NextResponse.json({
        success: true,
        message: 'Credits insuffisants. Veuillez recharger.',
      });
    }

    // Rechercher memoire contextuelle
    const memories = await embeddingService.searchSimilar(userMessage, user.id, 3);
    const context = memories.length > 0
      ? `Contexte: ${memories.map(m => m.content).join(' | ')}`
      : '';

    // Router IA pour la reponse
    const router = createAIRouter(user.id);
    const response = await router.chat([
      {
        role: 'system',
        content: `Tu es un assistant WhatsApp amical et professionnel. Reponds en francais. Sois concis (max 500 caracteres). ${context}`,
      },
      { role: 'user', content: userMessage },
    ], { model: 'default' });

    const reply = response.content.slice(0, 1000);

    // Sauvegarder en memoire
    await db.agentMemory.create({
      data: {
        agentId: agent.id,
        userId: user.id,
        content: `WhatsApp ${from}: ${userMessage.slice(0, 200)} -> ${reply.slice(0, 200)}`,
        source: 'whatsapp',
        relevance: 0.85,
      },
    });

    // Debiter les credits (1 credit par message)
    await db.user.update({
      where: { id: user.id },
      data: { credits: { decrement: 1 } },
    });

    log.info('whatsapp_message_processed', {
      from,
      agentId: agent.id,
      messageType: msg.type,
      responseType,
    });

    // Pour l'instant on retourne juste un success
    // L'envoi du message sera fait par un worker asynchrone
    return NextResponse.json({
      success: true,
      reply,
      responseType,
    });

  } catch (error) {
    log.error('whatsapp_webhook_error', { error: String(error) });
    // Toujours retourner 200 pour WhatsApp (sinon il renvoie)
    return NextResponse.json({ success: true });
  }
}
