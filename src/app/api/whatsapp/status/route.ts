import { NextRequest, NextResponse } from 'next/server';
import { whatsapp } from '@/lib/whatsapp-engine';
import { createLogger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const logger = createLogger('whatsapp-status-api');

/**
 * GET /api/whatsapp/status
 * Retourne le statut global d'intégration du canal WhatsApp Business API Meta.
 * 
 * Permet aux marchands, administrateurs et au tableau de bord DevOps de Gen3ia :
 * 1. De vérifier la présence des jetons d'accès Meta (WHATSAPP_TOKEN, PHONE_NUMBER_ID, etc.).
 * 2. De vérifier la disponibilité du quota de messages (Rate Limiting de 80 msgs/min).
 * 3. De garantir la santé opérationnelle du canal de vente principal au Cameroun.
 */
export async function GET(request: NextRequest) {
  try {
    const status = whatsapp.getStatus();

    logger.info('Consultation du statut WhatsApp Business API', {
      configured: status.configured,
      phoneNumberId: status.phoneNumberId,
    });

    return NextResponse.json({
      success: true,
      configured: status.configured,
      connected: status.configured, // Est considéré connecté lorsque le Token et l'ID de numéro sont renseignés
      phoneNumberId: status.phoneNumberId || null,
      businessId: status.businessId || null,
      hasVerifyToken: status.hasVerifyToken,
      rateLimit: status.rateLimit,
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('Erreur lors de la récupération du statut WhatsApp', { error: err });
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Erreur interne du serveur',
      },
      { status: 500 }
    );
  }
}
