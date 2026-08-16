// ============================================================
// Gen3ia — Referral System
// ============================================================
//  Croissance organique : chaque utilisateur a un code de
//  parrainage. Quand il invite quelqu'un, les deux gagnent
//  des crédits (5 chacun). Le parrain gagne aussi 10% des
//  crédits achetés par ses filleuls à vie.
//
//  En Afrique, le bouche-à-oreille est le canal #1 de découverte.
//  Ce système l'automatise et le récompense.
// ============================================================

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { sendPushNotification, NOTIFICATION_TEMPLATES } from '@/lib/push-notifications';

const log = createLogger('referral');

const REFERRAL_BONUS_REFERRER = 5;   // Crédits pour le parrain
const REFERRAL_BONUS_REFEREE = 5;    // Crédits pour le filleul
const REFERRAL_LIFETIME_PERCENT = 10; // % des achats du filleul vers le parrain

/**
 * Génère un code de parrainage unique pour un utilisateur.
 */
export async function generateReferralCode(userId: string, userName?: string): Promise<string> {
  // Format: GEN3IA-XXXX (4 chars aléatoires)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  const prefix = userName
    ? userName.slice(0, 3).toUpperCase().replace(/[^A-Z]/g, 'X')
    : 'GEN';

  const referralCode = `${prefix}${code}`;

  // Sauvegarder le code
  try {
    await db.user.update({
      where: { id: userId },
      data: { referralCode } as Record<string, unknown>,
    }).catch(() => {});
  } catch {
    // Field might not exist
  }

  log.info('Referral code generated', { userId, code: referralCode });
  return referralCode;
}

/**
 * Récupère le code de parrainage d'un utilisateur (le génère si nécessaire).
 */
export async function getReferralCode(userId: string, userName?: string): Promise<string> {
  try {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (user && (user as Record<string, unknown>).referralCode) {
      return (user as Record<string, unknown>).referralCode as string;
    }
  } catch {}

  return generateReferralCode(userId, userName);
}

/**
 * Applique un code de parrainage lors de l'inscription.
 * Crée la relation parrain-filleul et crédite les bonus.
 */
export async function applyReferralCode(
  newUserId: string,
  referralCode: string
): Promise<{ success: boolean; referrerName?: string; error?: string }> {
  try {
    // Trouver le parrain par son code
    const allUsers = await db.user.findMany({ where: {} });
    const referrer = (allUsers as Record<string, unknown>[])
      .find(u => (u.referralCode as string)?.toUpperCase() === referralCode.toUpperCase());

    if (!referrer) {
      return { success: false, error: 'Code de parrainage invalide' };
    }

    const referrerId = referrer.id as string;

    // Ne pas permettre l'auto-parrainage
    if (referrerId === newUserId) {
      return { success: false, error: 'Vous ne pouvez pas vous parrainer' };
    }

    // Vérifier que le nouvel utilisateur n'a pas déjà un parrain
    const existing = (allUsers as Record<string, unknown>[])
      .find(u => u.id === newUserId && u.referredBy);
    if (existing) {
      return { success: false, error: 'Vous avez déjà un parrain' };
    }

    // Créer la relation de parrainage
    await db.referral.create({
      data: {
        referrerId,
        referredId: newUserId,
        referralCode,
        bonusReferrer: REFERRAL_BONUS_REFERRER,
        bonusReferred: REFERRAL_BONUS_REFEREE,
        status: 'completed',
        createdAt: new Date(),
      },
    }).catch(() => {});

    // Créditer le parrain
    const referrerCredits = (referrer.credits as number) || 0;
    await db.user.update({
      where: { id: referrerId },
      data: {
        credits: referrerCredits + REFERRAL_BONUS_REFERRER,
        referredBy: null, // le parrain n'est pas parrainé
      } as Record<string, unknown>,
    }).catch(() => {});

    // Créditer le filleul
    const newUser = await db.user.findUnique({ where: { id: newUserId } });
    if (newUser) {
      const newCredits = (newUser as Record<string, unknown>).credits as number || 0;
      await db.user.update({
        where: { id: newUserId },
        data: {
          credits: newCredits + REFERRAL_BONUS_REFEREE,
          referredBy: referrerId,
        } as Record<string, unknown>,
      }).catch(() => {});
    }

    // Notifier le parrain
    await sendPushNotification(referrerId, {
      title: 'Nouveau filleul ! 🎉',
      body: `${(newUser as Record<string, unknown>)?.name || "Quelqu'un"} s'est inscrit avec votre code. Vous avez gagné ${REFERRAL_BONUS_REFERRER} crédits !`,
      tag: 'referral',
      url: '/settings/referral',
    }).catch(() => {});

    log.info('Referral applied', { referrerId, newUserId, code: referralCode });
    return {
      success: true,
      referrerName: (referrer.name as string) || 'votre ami',
    };
  } catch (err) {
    log.error('applyReferralCode failed', { error: String(err) });
    return { success: false, error: 'Erreur lors de l\'application du code' };
  }
}

/**
 * Récupère les statistiques de parrainage d'un utilisateur.
 */
export async function getReferralStats(userId: string): Promise<{
  referralCode: string;
  totalReferrals: number;
  totalCreditsEarned: number;
  activeReferrals: number;
  referrals: { id: string; name: string; createdAt: string; status: string }[];
}> {
  try {
    const code = await getReferralCode(userId);

    // Récupérer tous les filleuls
    const allReferrals = await db.referral.findMany({ where: {} });
    const userReferrals = (allReferrals as Record<string, unknown>[])
      .filter(r => r.referrerId === userId)
      .sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime());

    // Récupérer les noms des filleuls
    const allUsers = await db.user.findMany({ where: {} });
    const userMap = new Map<string, Record<string, unknown>>();
    for (const u of allUsers as Record<string, unknown>[]) {
      userMap.set(u.id as string, u);
    }

    const referrals = userReferrals.map(r => {
      const referred = userMap.get(r.referredId as string);
      return {
        id: r.referredId as string,
        name: (referred?.name as string) || 'Utilisateur',
        createdAt: r.createdAt as string,
        status: r.status as string,
      };
    });

    const totalCreditsEarned = userReferrals.reduce(
      (sum, r) => sum + ((r.bonusReferrer as number) || 0),
      0
    );

    return {
      referralCode: code,
      totalReferrals: userReferrals.length,
      totalCreditsEarned,
      activeReferrals: referrals.filter(r => r.status === 'completed').length,
      referrals,
    };
  } catch {
    return {
      referralCode: '',
      totalReferrals: 0,
      totalCreditsEarned: 0,
      activeReferrals: 0,
      referrals: [],
    };
  }
}

/**
 * Crédite le parrain quand un filleul achète des crédits.
 * À appeler après chaque achat de crédits.
 */
export async function creditReferrerOnPurchase(
  buyerId: string,
  creditsPurchased: number
): Promise<void> {
  try {
    // Trouver le parrain du buyer
    const buyer = await db.user.findUnique({ where: { id: buyerId } });
    if (!buyer || !(buyer as Record<string, unknown>).referredBy) return;

    const referrerId = (buyer as Record<string, unknown>).referredBy as string;
    const bonus = Math.floor(creditsPurchased * REFERRAL_LIFETIME_PERCENT / 100);

    if (bonus <= 0) return;

    // Créditer le parrain
    const referrer = await db.user.findUnique({ where: { id: referrerId } });
    if (referrer) {
      const referrerCredits = (referrer as Record<string, unknown>).credits as number || 0;
      await db.user.update({
        where: { id: referrerId },
        data: { credits: referrerCredits + bonus } as Record<string, unknown>,
      }).catch(() => {});

      log.info('Referrer credited on purchase', { referrerId, buyerId, bonus });
    }
  } catch (err) {
    log.error('creditReferrerOnPurchase failed', { error: String(err) });
  }
}
