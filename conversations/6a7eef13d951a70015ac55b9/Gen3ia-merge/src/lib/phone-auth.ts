// ============================================================
// Gen3ia — Phone Authentication (SMS OTP)
// ============================================================
//  Problème : L'auth email-only est une barrière en Afrique où
//  l'email est peu utilisé. Le téléphone est le standard.
//
//  Solution : Authentification par numéro de téléphone via code
//  SMS OTP. Fonctionne avec ou sans Firebase Phone Auth.
//
//  Flux :
//    1. POST /api/auth/phone/send-otp  → envoi du code SMS
//    2. POST /api/auth/phone/verify    → vérification + création session
//
//  Sécurité :
//    - Code OTP à 6 chiffres, valide 5 minutes
//    - Max 3 tentatives par code
//    - Max 5 envois par numéro / heure (anti-spam)
//    - Hash du code en base (jamais stocké en clair)
// ============================================================

import { createHmac, randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { sendDirectSms } from '@/lib/sms-engine';

const log = createLogger('phone-auth');

const OTP_EXPIRY_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 3;
const OTP_SEND_RATE_LIMIT_PER_HOUR = 5;

// Clé secrète pour hasher les codes OTP
const OTP_HASH_SECRET = process.env.OTP_HASH_SECRET || 'gen3ia-otp-secret-change-in-prod';

/**
 * Génère un code OTP à 6 chiffres.
 */
function generateOtpCode(): string {
  const bytes = randomBytes(3);
  const num = (bytes[0] << 16 | bytes[1] << 8 | bytes[2]) % 1000000;
  return num.toString().padStart(6, '0');
}

/**
 * Hash un code OTP pour le stockage (jamais en clair).
 */
function hashOtp(code: string): string {
  return createHmac('sha256', OTP_HASH_SECRET).update(code).digest('hex');
}

/**
 * Normalise un numéro de téléphone au format E.164.
 * Si le numéro commence par 6 ou 7 (Cameroun), ajoute +237.
 */
export function normalizePhoneNumber(phone: string): string {
  let cleaned = phone.replace(/[\s\-().]/g, '');
  if (!cleaned.startsWith('+')) {
    if (cleaned.length === 9 && (cleaned.startsWith('6') || cleaned.startsWith('7'))) {
      cleaned = '+237' + cleaned;
    } else if (cleaned.length === 12 && cleaned.startsWith('237')) {
      cleaned = '+' + cleaned;
    } else if (cleaned.length === 13 && cleaned.startsWith('00237')) {
      cleaned = '+237' + cleaned.slice(5);
    } else if (!cleaned.startsWith('00')) {
      cleaned = '+' + cleaned;
    } else {
      cleaned = '+' + cleaned.slice(2);
    }
  }
  return cleaned;
}

/**
 * Valide qu'un numéro a un format plausible.
 */
export function isValidPhoneNumber(phone: string): boolean {
  const normalized = normalizePhoneNumber(phone);
  return /^\+\d{8,15}$/.test(normalized);
}

/**
 * Envoie un code OTP par SMS.
 */
export async function sendOtp(phoneNumber: string): Promise<{ success: boolean; error?: string }> {
  const normalized = normalizePhoneNumber(phoneNumber);
  if (!isValidPhoneNumber(normalized)) {
    return { success: false, error: 'Numéro de téléphone invalide' };
  }

  // Rate limiting : vérifier combien d'OTP ont été envoyés dans la dernière heure
  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);

  try {
    const existing = await db.otpRequest.findMany({
      where: {},
    });

    const recentOtps = (existing as Record<string, unknown>[])
      .filter(r => r.phoneNumber === normalized && new Date(r.createdAt as string) >= oneHourAgo);

    if (recentOtps.length >= OTP_SEND_RATE_LIMIT_PER_HOUR) {
      return { success: false, error: 'Trop de demandes OTP. Réessayez dans une heure.' };
    }

    // Générer et hasher le code
    const code = generateOtpCode();
    const hashedCode = hashOtp(code);

    // Sauvegarder en base
    await db.otpRequest.create({
      data: {
        phoneNumber: normalized,
        hashedCode,
        attempts: 0,
        verified: false,
        expiresAt: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000),
        createdAt: new Date(),
      },
    });

    // Envoyer le SMS
    const message = `Gen3ia: Votre code de verification est ${code}. Valide ${OTP_EXPIRY_MINUTES} minutes. Ne le partagez avec personne.`;
    const result = await sendDirectSms(normalized, message);

    if (!result.success) {
      log.error('OTP SMS send failed', { phone: normalized, error: result.error });
      return { success: false, error: 'Envoi SMS échoué. Réessayez ou utilisez l\'auth email.' };
    }

    log.info('OTP sent', { phone: normalized });
    return { success: true };
  } catch (err) {
    log.error('sendOtp failed', { phone: normalized, error: String(err) });
    return { success: false, error: 'Erreur lors de l\'envoi du code' };
  }
}

/**
 * Vérifie un code OTP.
 * Retourne le numéro normalisé si succès, null si échec.
 */
export async function verifyOtp(phoneNumber: string, code: string): Promise<{ success: boolean; phoneNumber?: string; error?: string }> {
  const normalized = normalizePhoneNumber(phoneNumber);

  if (!/^\d{6}$/.test(code)) {
    return { success: false, error: 'Le code doit contenir 6 chiffres' };
  }

  try {
    const otps = await db.otpRequest.findMany({
      where: {},
    });

    // Trouver l'OTP le plus récent non vérifié pour ce numéro
    const candidates = (otps as Record<string, unknown>[])
      .filter(r =>
        r.phoneNumber === normalized &&
        r.verified === false &&
        new Date(r.expiresAt as string) > new Date()
      )
      .sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime());

    if (candidates.length === 0) {
      return { success: false, error: 'Aucun code valide trouvé. Demandez un nouveau code.' };
    }

    const otpRecord = candidates[0];
    const otpId = otpRecord.id as string;
    const attempts = (otpRecord.attempts as number) || 0;

    // Vérifier le nombre de tentatives
    if (attempts >= OTP_MAX_ATTEMPTS) {
      await db.otpRequest.update({
        where: { id: otpId },
        data: { verified: false },
      });
      return { success: false, error: 'Trop de tentatives. Demandez un nouveau code.' };
    }

    // Vérifier le code
    const hashedInput = hashOtp(code);
    if (hashedInput !== otpRecord.hashedCode) {
      // Incrémenter les tentatives
      await db.otpRequest.update({
        where: { id: otpId },
        data: { attempts: attempts + 1 },
      });
      const remaining = OTP_MAX_ATTEMPTS - (attempts + 1);
      return { success: false, error: `Code incorrect. ${remaining} tentative(s) restante(s).` };
    }

    // Marquer comme vérifié
    await db.otpRequest.update({
      where: { id: otpId },
      data: { verified: true, verifiedAt: new Date() },
    });

    log.info('OTP verified', { phone: normalized });
    return { success: true, phoneNumber: normalized };
  } catch (err) {
    log.error('verifyOtp failed', { phone: normalized, error: String(err) });
    return { success: false, error: 'Erreur lors de la vérification' };
  }
}

/**
 * Crée ou récupère un utilisateur à partir de son numéro de téléphone.
 * Si l'utilisateur existe déjà (par phone), retourne son UID.
 * Sinon, crée un nouvel utilisateur avec un email généré.
 */
export async function findOrCreatePhoneUser(
  phoneNumber: string,
  name?: string
): Promise<{ uid: string; isNewUser: boolean; email: string }> {
  // Vérifier si un utilisateur avec ce numéro existe déjà
  const existingUsers = await db.user.findMany({ where: {} });
  const phoneUser = (existingUsers as Record<string, unknown>[])
    .find(u => u.phoneNumber === phoneNumber);

  if (phoneUser) {
    return {
      uid: phoneUser.id as string,
      isNewUser: false,
      email: phoneUser.email as string,
    };
  }

  // Créer un nouvel utilisateur
  // Génère un email technique (utilisé en interne par Firebase)
  const generatedEmail = `${phoneNumber.replace(/[^0-9]/g, '')}@phone.gen3ia.app`;

  try {
    const newUser = await db.user.create({
      data: {
        email: generatedEmail,
        name: name || `User ${phoneNumber.slice(-4)}`,
        phoneNumber,
        phoneVerified: true,
        authMethod: 'phone',
        plan: 'free',
        credits: 10, // Crédits de bienvenue
        createdAt: new Date(),
      },
    });

    log.info('Phone user created', { phone: phoneNumber, uid: (newUser as Record<string, unknown>).id });

    return {
      uid: (newUser as Record<string, unknown>).id as string,
      isNewUser: true,
      email: generatedEmail,
    };
  } catch (err) {
    log.error('findOrCreatePhoneUser failed', { phone: phoneNumber, error: String(err) });
    throw new Error('Impossible de créer le compte utilisateur');
  }
}
