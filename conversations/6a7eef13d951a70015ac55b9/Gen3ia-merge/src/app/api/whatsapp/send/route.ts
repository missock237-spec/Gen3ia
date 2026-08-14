import { NextRequest, NextResponse } from 'next/server';
import { whatsapp } from '@/lib/whatsapp-engine';
import { createLogger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const logger = createLogger('whatsapp-send-api');

export interface SendWhatsAppRequestBody {
  to: string;
  text?: string;
  template?: string;
  templateParams?: Record<string, string> | string[];
  languageCode?: string;
  imageUrl?: string;
  caption?: string;
}

/**
 * POST /api/whatsapp/send
 * Endpoint pour l'envoi de messages WhatsApp (Texte, Média ou Template officiel Meta).
 * 
 * Cas d'usage Afrique / Cameroun :
 * - Confirmation de paiement Mobile Money (MTN / Orange)
 * - Notification d'expédition / livraison à Douala ou Yaoundé
 * - Relance de paniers abandonnés ou réponse automatique par l'Agent AI
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SendWhatsAppRequestBody;
    const { to, text, template, templateParams, languageCode = 'fr', imageUrl, caption } = body;

    if (!to) {
      return NextResponse.json(
        { success: false, error: 'Le champ "to" (numéro de téléphone) est requis.' },
        { status: 400 }
      );
    }

    if (!text && !template && !imageUrl) {
      return NextResponse.json(
        {
          success: false,
          error: 'Un contenu est requis : renseignez "text", "template" ou "imageUrl".',
        },
        { status: 400 }
      );
    }

    logger.info('Demande d’envoi de message WhatsApp reçue sur l’API', {
      to,
      isTemplate: Boolean(template),
      isImage: Boolean(imageUrl),
    });

    let result;

    if (template) {
      // Envoi via Template homologué
      result = await whatsapp.sendTemplate(to, template, templateParams, languageCode);
    } else {
      // Envoi de message Texte ou Image standard
      result = await whatsapp.sendMessage(to, text || '', {
        imageUrl,
        caption,
      });
    }

    if (!result.success) {
      logger.warn('Échec de l’envoi WhatsApp via l’API', { error: result.error, to });
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Erreur lors de l’envoi du message WhatsApp',
          details: result.details,
        },
        { status: result.error?.includes('non configuré') ? 503 : 400 }
      );
    }

    logger.info('Message WhatsApp transmis avec succès', { messageId: result.messageId, to });

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
    });
  } catch (err) {
    logger.error('Erreur serveur inattendue lors de l’envoi de message WhatsApp', { error: err });
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Erreur serveur interne',
      },
      { status: 500 }
    );
  }
}
