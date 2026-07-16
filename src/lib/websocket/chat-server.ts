/**
 * WebSocket Server — Chat en temps réel avec les agents AI
 * Utilise Socket.IO pour le streaming des réponses
 */

import { createLogger } from '@/lib/logger';
import { generateText, streamText } from '@/lib/ai-router';
import { db } from '@/lib/db';

const log = createLogger('websocket');

// ============================================================
// Types
// ============================================================

export interface WsMessage {
  type: 'message' | 'typing' | 'error' | 'history' | 'status';
  conversationId?: string;
  content?: string;
  role?: 'user' | 'assistant' | 'system';
  agentId?: string;
  timestamp?: string;
}

export interface ConversationParticipant {
  userId: string;
  userName: string;
  agentId?: string;
  agentName?: string;
}

// ============================================================
// Gestion des conversations en temps réel
// ============================================================

const conversations = new Map<string, {
  participants: ConversationParticipant[];
  messages: WsMessage[];
  createdAt: Date;
}>();

/**
 * Crée ou récupère une conversation
 */
export function getOrCreateConversation(conversationId: string) {
  if (!conversations.has(conversationId)) {
    conversations.set(conversationId, {
      participants: [],
      messages: [],
      createdAt: new Date(),
    });
  }
  return conversations.get(conversationId)!;
}

/**
 * Ajoute un message à la conversation
 */
export async function addMessage(
  conversationId: string,
  message: WsMessage,
): Promise<void> {
  const conv = getOrCreateConversation(conversationId);
  conv.messages.push(message);

  // Sauvegarder en base de données
  if (message.content && message.role) {
    await db.message.create({
      data: {
        role: message.role,
        content: message.content,
        conversationId,
      },
    });
  }
}

/**
 * Récupère l'historique d'une conversation
 */
export async function getConversationHistory(
  conversationId: string,
  limit = 50,
): Promise<WsMessage[]> {
  // D'abord, récupérer depuis la base
  const dbMessages = await db.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  if (dbMessages.length > 0) {
    return dbMessages.map(m => ({
      type: 'message' as const,
      conversationId,
      content: m.content,
      role: m.role as 'user' | 'assistant' | 'system',
      timestamp: m.createdAt.toISOString(),
    }));
  }

  // Fallback sur la mémoire cache
  const conv = conversations.get(conversationId);
  return conv?.messages.slice(-limit) || [];
}

/**
 * Traite un message utilisateur et génère une réponse AI
 */
export async function processUserMessage(
  conversationId: string,
  userId: string,
  content: string,
  agentId?: string,
): Promise<{ response: string; done: boolean }> {
  // Récupérer l'historique
  const history = await getConversationHistory(conversationId, 20);

  // Construire les messages pour l'AI
  const messages = history.map(m => ({
    role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: m.content || '',
  }));

  // Ajouter le contexte de l'agent si spécifié
  let systemPrompt = 'Tu es un assistant AI utile et professionnel.';
  if (agentId) {
    const agent = await db.agent.findUnique({ where: { id: agentId } });
    if (agent) {
      systemPrompt = agent.description || agent.config || systemPrompt;
    }
  }

  // Ajouter le message utilisateur
  messages.push({ role: 'user', content });

  // Générer la réponse
  const result = await generateText(messages, { systemPrompt });

  // Sauvegarder les messages
  await addMessage(conversationId, {
    type: 'message',
    conversationId,
    content,
    role: 'user',
    timestamp: new Date().toISOString(),
  });

  await addMessage(conversationId, {
    type: 'message',
    conversationId,
    content: result.content,
    role: 'assistant',
    timestamp: new Date().toISOString(),
  });

  // Mettre à jour la conversation
  await db.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  return { response: result.content, done: true };
}

/**
 * Route API pour le chat (fallback HTTP quand WebSocket n'est pas disponible)
 */
export async function handleChatMessage(
  userId: string,
  conversationId: string,
  content: string,
  agentId?: string,
): Promise<{ response: string; conversationId: string }> {
  const result = await processUserMessage(conversationId, userId, content, agentId);
  return { response: result.response, conversationId };
}
