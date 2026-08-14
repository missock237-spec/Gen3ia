import { NextRequest, NextResponse } from 'next/server';
import { whatsapp } from '@/lib/whatsapp-engine';
import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const logger = createLogger('whatsapp-webhook-api');

/**
 * GET - Point d'entrée pour la vérification initiale du Webhook Meta WhatsApp.
 * Meta effectue une requête GET avec :
 * - hub.mode = 'subscribe'
 * - hub.verify_token = le jeton WHATSAPP_VERIFY_TOKEN défini
 * - hub.challenge = une chaîne aléatoire à renvoyer sous forme de texte brut avec HTTP 200.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    logger.info('Tentative de vérification du Webhook WhatsApp par Meta', {
      mode,
      hasChallenge: Boolean(challenge),
    });

    const verifiedChallenge = whatsapp.verifyWebhook(mode, challenge, token);

    if (verifiedChallenge) {
      // Renvoi impératif de la chaîne challenge avec status 200 et type text/plain
      return new Response(verifiedChallenge, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain',
        },
      });
    }

    logger.warn('Échec de validation du Webhook WhatsApp : jeton ou paramètres invalides');
    return NextResponse.json(
      { error: 'Échec de vérification du Webhook Meta WhatsApp. Jeton invalide.' },
      { status: 403 }
    );
  } catch (err) {
    logger.error('Erreur serveur lors de la vérification du Webhook', { error: err });
    return NextResponse.json(
      { error: 'Erreur interne du serveur lors de la vérification' },
      { status: 500 }
    );
  }
}

/**
 * POST - Point d'entrée pour la réception des évènements WhatsApp (messages entrants, statuts).
 * Contexte Africain (Cameroun) :
 * Les réseaux mobiles Orange / MTN subissent parfois des latences élevées.
 * Meta exige un retour HTTP 200 rapide (< 3s) sous peine de retrier indéfiniment les notifications.
 * Nous enregistrons donc les messages de manière asynchrone et les transmettons à l'Agent OS Engine.
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    // Traitement et normalisation via le moteur WhatsApp
    const { messages, contacts, statuses } = whatsapp.receiveWebhook(payload);

    logger.info('Notification de Webhook WhatsApp reçue', {
      receivedMessages: messages.length,
      receivedStatuses: statuses.length,
    });

    // Stockage et transmission des messages reçus aux agents Gen3ia
    const processPromises = messages.map(async (msg) => {
      try {
        const contact = contacts.find((c) => c.wa_id === msg.from);
        const senderName = contact?.profile?.name || 'Inconnu';

        // 1. Sauvegarde dans la collection Firestore / DB des messages reçus
        const savedMessageRecord = {
          messageId: msg.id,
          from: msg.from,
          senderName,
          to: msg.to || '',
          text: msg.text?.body || '',
          type: msg.type,
          timestamp: msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : new Date().toISOString(),
          status: 'received',
          source: 'whatsapp_cloud_api',
          rawPayload: msg.raw,
          createdAt: new Date().toISOString(),
        };

        // Sauvegarde principale dans les logs de conversation WhatsApp
        await (db as any).collection('whatsapp_incoming_messages').add(savedMessageRecord);

        // 2. Transmettre le message à l'Agent OS Gen3ia (orchestrateur multi-agents)
        // Permet à l'agent conversationnel de répondre aux requêtes clients (prix, Mobile Money, dispo produits)
        if (msg.text?.body) {
          logger.info('Transmission du message WhatsApp à l’Agent Engine OS', {
            from: msg.from,
            textPreview: msg.text.body.slice(0, 50),
          });

          // Stockage dans l'historique de conversation de l'agent
          await (db as any).collection('agent_conversations').add({
            channel: 'whatsapp',
            senderPhone: msg.from,
            userMessage: msg.text.body,
            status: 'pending_agent_response',
            createdAt: new Date().toISOString(),
          });
        }
      } catch (saveErr) {
        logger.error('Erreur lors du traitement / stockage du message WhatsApp entrant', {
          messageId: msg.id,
          error: saveErr,
        });
      }
    });

    // On attend le traitement local sans bloquer la réponse Meta si possible
    await Promise.allSettled(processPromises);

    // Meta requiert un retour HTTP 200 OK
    return NextResponse.json({
      status: 'ok',
      processedMessages: messages.length,
      processedStatuses: statuses.length,
    });
  } catch (err) {
    logger.error('Erreur serveur lors de la réception du Webhook WhatsApp', { error: err });
    // Même en cas d'erreur de parsing local, on retourne 200 OK à Meta pour ne pas bloquer la queue webhook de Facebook
    return NextResponse.json(
      { status: 'error', error: err instanceof Error ? err.message : 'Erreur inconnue' },
      { status: 200 }
    );
  }
}
