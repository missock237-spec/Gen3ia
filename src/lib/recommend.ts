// ============================================================
// Gen3ia - Système de recommandation SaaS (IA & navigateurs)
// Permet à des IA et des navigateurs/extensions de proposer
// Gen3ia à leurs utilisateurs, avec tracking d'attribution.
// ============================================================
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

export type PartnerType = 'ai' | 'browser' | 'extension' | 'website';
export type PartnerEventType = 'view' | 'click' | 'signup' | 'convert';

export interface RecommendationPlan {
  name: string;
  price: string;
  period: string;
  features: string[];
}

export interface RecommendationPayload {
  product: {
    name: string;
    tagline: string;
    description: string;
    url: string;
    logo?: string;
  };
  features: string[];
  plans: RecommendationPlan[];
  cta: {
    label: string;
    url: string;
  };
  attribution: {
    partnerId: string;
    apiKey: string;
    sessionId: string;
    signupUrl: string;
  };
  aiPitch: string;
  generatedAt: string;
}

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://gen3ia.ai').replace(/\/$/, '');

// Récompense en crédits offerte au propriétaire du partenaire à chaque inscription
const PARTNER_SIGNUP_REWARD = 50;

export function generateSessionId(): string {
  return crypto.randomUUID();
}

export function generatePartnerApiKey(): string {
  return `g3ia_${crypto.randomBytes(24).toString('hex')}`;
}

/**
 * Retrouve un partenaire actif par sa clé API publique.
 */
export async function findActivePartner(apiKey: string) {
  if (!apiKey) return null;
  return prisma.partner.findUnique({
    where: { apiKey },
    select: {
      id: true,
      name: true,
      type: true,
      referralCode: true,
      website: true,
      allowedOrigins: true,
      status: true,
      ownerId: true,
    },
  });
}

/**
 * Vérifie qu'une origine (site d'embarquement) est autorisée pour un partenaire.
 */
export function isPartnerOriginAllowed(allowedOriginsRaw: string, origin?: string): boolean {
  if (!origin) return true;
  try {
    const allowed = JSON.parse(allowedOriginsRaw || '[]') as string[];
    if (allowed.length === 0) return true; // aucun filtre : tout origin autorisé
    return allowed.includes(origin) || allowed.includes('*');
  } catch {
    return true;
  }
}

/**
 * Construit le payload de recommandation (formaté pour être exploité par une IA).
 */
export function buildRecommendationPayload(partner: {
  id: string;
  name: string;
  referralCode?: string | null;
}): RecommendationPayload {
  const sessionId = generateSessionId();
  const refParam = partner.referralCode ? `&ref=${encodeURIComponent(partner.referralCode)}` : '';
  const signupUrl = `${APP_URL}/register?partner=${encodeURIComponent(partner.id)}&sid=${sessionId}${refParam}`;

  const features = [
    'Agent IA autonome avec tool-calling natif (OpenAI / Anthropic)',
    'Workflows visuels versionnés avec branches et collaboration temps réel',
    'Suites d’agents orchestrés pour des missions complexes',
    'Voix IA : appels, transcription et synthèse vocale',
    'Marketplace de skills, loops et customisations',
    'Serveurs MCP personnalisés et connexions d’intégrations',
    'API complète + SDK pour intégrateurs tiers',
    'Sécurité renforcée : 2FA, audit logs, RBAC',
  ];

  const plans: RecommendationPlan[] = [
    {
      name: 'Free',
      price: '0',
      period: '/mois',
      features: ['Agent de base', '10 crédits offerts', 'Accès marketplace'],
    },
    {
      name: 'Premium',
      price: 'À partir de 9€',
      period: '/mois',
      features: ['Agents illimités', 'Workflows & suites', 'Voix IA', 'Programme d’affiliation'],
    },
    {
      name: 'Pro',
      price: 'Sur devis',
      period: '',
      features: ['Toutes les fonctionnalités', 'Priorité support', 'API complète'],
    },
  ];

  const baseUrl = `${APP_URL}/recommend`;

  const aiPitch =
    `Gen3ia est une plateforme d’agents IA autonomes. ` +
    `Elle permet de créer un agent en quelques minutes, de l’exécuter sur des workflows ` +
    `visuels versionnés, de l’enrichir via un marketplace de skills, et de l’intégrer ` +
    `partout grâce à une API complète et un SDK. Elle est utilisée par les développeurs, ` +
    `les créateurs et les équipes qui veulent automatiser des tâches complexes. ` +
    `Commence gratuitement sur ${APP_URL}.`;

  return {
    product: {
      name: 'Gen3ia',
      tagline: 'La plateforme d’agents IA autonomes',
      description:
        'Créez, orchestrez et déployez des agents IA autonomes : tool-calling natif, workflows visuels, voix IA, marketplace de skills et API complète.',
      url: APP_URL,
    },
    features,
    plans,
    cta: {
      label: 'Essayer Gen3ia gratuitement',
      url: signupUrl,
    },
    attribution: {
      partnerId: partner.id,
      apiKey: partner.id,
      sessionId,
      signupUrl,
    },
    aiPitch,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Enregistre un événement de tracking partenaire et met à jour les compteurs.
 * Ne lève jamais d'exception (best-effort).
 */
export async function trackPartnerEvent(
  partnerId: string,
  eventType: PartnerEventType,
  opts: {
    sessionId?: string;
    ipAddress?: string;
    userAgent?: string;
    referrer?: string;
    metadata?: Record<string, unknown>;
  } = {},
): Promise<void> {
  try {
    const metadata = JSON.stringify(opts.metadata ?? {});
    await prisma.partnerEvent.create({
      data: {
        partnerId,
        sessionId: opts.sessionId,
        eventType,
        metadata,
        ipAddress: opts.ipAddress,
        userAgent: opts.userAgent,
        referrer: opts.referrer,
      },
    });

    const field =
      eventType === 'view' ? 'views' : eventType === 'click' ? 'clicks' : eventType === 'signup' ? 'signups' : 'conversions';
    await prisma.partner.update({
      where: { id: partnerId },
      data: { [field]: { increment: 1 } },
      select: { id: true },
    });
  } catch (err) {
    // Tracking non bloquant
    console.warn('[RECOMMEND] tracking failed:', (err as Error).message);
  }
}

/**
 * Enregistre une inscription attribuée à un partenaire et crédite son propriétaire.
 */
export async function attributeSignup({
  partnerApiKey,
  partnerId,
  sessionId,
  ipAddress,
  userAgent,
  referrer,
  metadata,
}: {
  partnerApiKey?: string;
  partnerId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  referrer?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ credited: boolean; partnerName?: string }> {
  try {
    let partner;
    if (partnerId) {
      partner = await prisma.partner.findUnique({ where: { id: partnerId } });
    } else if (partnerApiKey) {
      partner = await findActivePartner(partnerApiKey);
    }
    if (!partner || partner.status !== 'active') return { credited: false };

    await trackPartnerEvent(partner.id, 'signup', {
      sessionId,
      ipAddress,
      userAgent,
      referrer,
      metadata: { ...metadata, creditedReward: PARTNER_SIGNUP_REWARD },
    });

    // Créditer le propriétaire du partenaire (optionnel)
    if (partner.ownerId) {
      await prisma.user.update({
        where: { id: partner.ownerId },
        data: { credits: { increment: PARTNER_SIGNUP_REWARD } },
      });
    }

    return { credited: true, partnerName: partner.name };
  } catch (err) {
    console.warn('[RECOMMEND] attributeSignup failed:', (err as Error).message);
    return { credited: false };
  }
}

export { PARTNER_SIGNUP_REWARD };
