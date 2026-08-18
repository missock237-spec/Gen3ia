// ============================================================
// Gen3ia — Admin Account Recognition (Confidential)
// ============================================================
//  Module serveur-only. L'admin est reconnu par CUMUL de critères
//  stricts (deny-by-default) :
//
//    1. Le cookie de session Firebase doit passer la vérification
//       cryptographique (verifySessionCookie avec checkRevoked=true).
//    2. L'UID Firebase doit figurer dans ADMIN_BOOTSTRAP_UIDS (env).
//    3. Le code confidentiel ADMIN_BOOTSTRAP_CODE doit être présent en
//       mémoire serveur (vault runtime chargé au boot via bootstrap-admin.ts).
//    4. La custom claim Firebase customClaims.role === 'admin'.
//
//  Tant que ces 4 critères ne sont pas TOUS satisfaits simultanément,
//  l'accès est refusé. Aucune information confidentielle n'est jamais
//  logguée ni renvoyée dans une réponse HTTP.
//
//  ADMIN BOOTSTRAP FLOW :
//    - Au démarrage serveur (scripts/bootstrap-admin.ts), l'opérateur
//      fournit ADMIN_BOOTSTRAP_EMAIL + ADMIN_BOOTSTRAP_PASSWORD +
//      ADMIN_BOOTSTRAP_CODE dans l'environnement.
//    - Le script crée l'utilisateur Firebase Auth, pose la custom claim
//      {role:'admin'}, persiste le compte dans Firestore (plan=enterprise,
//      credits=Number.POSITIVE_INFINITY, isActive=true, isEmailVerified=true)
//      et enregistre l'UID + le hash du code dans le runtime vault.
//    - Au runtime, isGen3iaAdmin() lit le vault + la session + les claims
//      pour décider de l'accès.
// ============================================================

import crypto from 'node:crypto';
import { getAdminAuth } from '@/lib/firebase/admin';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';

const log = createLogger('admin-account');

// ============================================================
// Runtime vault — populated by bootstrap-admin.ts at server start
// ============================================================

interface AdminVaultEntry {
  uid: string;
  email: string;
  codeHash: string;     // pbkdf2(ADMIN_BOOTSTRAP_CODE, salt)
  codeSalt: string;
  createdAt: number;
}

const adminVault = new Map<string, AdminVaultEntry>();

const ADMIN_UIDS_ENV = (process.env.ADMIN_BOOTSTRAP_UIDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Admin recognition config (read-only from env)
const ADMIN_PLAN = 'enterprise';
const ADMIN_ROLE = 'admin';

// Free-tier override marker stored on the user record.
// All billing/credit checks short-circuit when this flag is true.
export const ADMIN_FREE_TIER_FLAG = 'isGen3iaAdminFreeTier';

// ============================================================
// Vault API (called only by bootstrap-admin.ts)
// ============================================================

/**
 * Enregistre un compte admin dans le runtime vault.
 * À appeler UNIQUEMENT par scripts/bootstrap-admin.ts après création
 * Firebase Auth + custom claims + record Firestore.
 *
 * Le code confidentiel est hashé (pbkdf2, 100k itérations, sha256) ;
 * seul le hash est conservé en mémoire — jamais en clair, jamais loggué.
 */
export function registerAdminInVault(params: {
  uid: string;
  email: string;
  confidentialCode: string;
}): void {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(
    params.confidentialCode,
    salt,
    100_000,
    32,
    'sha256',
  );
  adminVault.set(params.uid, {
    uid: params.uid,
    email: params.email.toLowerCase(),
    codeHash: hash.toString('hex'),
    codeSalt: salt.toString('hex'),
    createdAt: Date.now(),
  });
  log.info('admin_vault_registered', { uid: params.uid });
}

/**
 * Indique si le runtime vault a au moins un admin enregistré.
 * Utile pour les diagnostics de bootstrap (sans divulguer l'UID).
 */
export function hasRegisteredAdmins(): boolean {
  return adminVault.size > 0;
}

/**
 * Retourne la liste des UIDs admin enregistrés dans le vault runtime.
 * À utiliser avec parcimonie — UIDs seuls, pas d'email ni de code.
 */
export function listAdminUids(): string[] {
  return Array.from(adminVault.keys());
}

// ============================================================
// Public admin recognition — called by API routes
// ============================================================

export interface AdminRecognitionResult {
  isAdmin: boolean;
  uid?: string;
  email?: string;
  reason?: string;
}

/**
 * Reconnaît un compte admin de manière confidentielle et stricte.
 *
 * Cumul obligatoire :
 *  1. Session cookie Firebase cryptographiquement valide
 *  2. Custom claim Firebase customClaims.role === 'admin'
 *  3. UID présent dans ADMIN_BOOTSTRAP_UIDS (env)
 *  4. UID présent dans le runtime vault (code hashé connu)
 *
 * Aucun des critères n'est seul suffisant — il faut les 4.
 */
export async function recognizeAdmin(idTokenOrSessionCookie?: string): Promise<AdminRecognitionResult> {
  if (!idTokenOrSessionCookie) {
    return { isAdmin: false, reason: 'no_token' };
  }

  try {
    const auth = getAdminAuth();
    // verifySessionCookie with checkRevoked=true —
    // valide signature + expiration + révocation Firebase Auth
    const decoded = await auth.verifySessionCookie(idTokenOrSessionCookie, true);
    const user = await auth.getUser(decoded.uid);

    // (2) custom claim role === admin
    const role = (user.customClaims?.role as string) || 'user';
    if (role !== ADMIN_ROLE) {
      return { isAdmin: false, uid: decoded.uid, reason: 'role_not_admin' };
    }

    // (3) UID dans ADMIN_BOOTSTRAP_UIDS (env, allowlist)
    if (!ADMIN_UIDS_ENV.includes(decoded.uid)) {
      return { isAdmin: false, uid: decoded.uid, reason: 'uid_not_in_allowlist' };
    }

    // (4) UID dans le runtime vault (bootstrap complet confirmé)
    const entry = adminVault.get(decoded.uid);
    if (!entry) {
      return { isAdmin: false, uid: decoded.uid, reason: 'vault_not_registered' };
    }

    return {
      isAdmin: true,
      uid: decoded.uid,
      email: user.email || undefined,
    };
  } catch (err) {
    log.warn('admin_recognition_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { isAdmin: false, reason: 'verify_failed' };
  }
}

/**
 * Variante : reconnaît l'admin à partir d'un NextRequest (lecture du
 * cookie de session Firebase). Retourne true uniquement si les 4 critères
 * sont satisfaits.
 */
export async function isRequestFromAdmin(request: Request): Promise<AdminRecognitionResult> {
  const cookieHeader = request.headers.get('cookie') || '';
  const sessionCookie = extractCookie(cookieHeader, 'gen3ia_session');
  return recognizeAdmin(sessionCookie);
}

function extractCookie(header: string, name: string): string | undefined {
  const parts = header.split(';').map((s) => s.trim());
  for (const p of parts) {
    const [k, v] = p.split('=');
    if (k === name && v) return v;
  }
  return undefined;
}

// ============================================================
// Admin free-tier gate (billing bypass)
// ============================================================

/**
 * Indique si un UID bénéficie du "free-tier admin" :
 * toutes les fonctionnalités du projet sont gratuites pour ce compte.
 *
 * Conditions :
 *  - UID dans ADMIN_BOOTSTRAP_UIDS (env)
 *  - UID dans le runtime vault
 *  - Le compte Firestore doit porter le flag isGen3iaAdminFreeTier=true
 *
 * À appeler par les modules billing/credits/plans pour court-circuiter
 * toute vérification de solde, quota, ou facturation.
 */
export async function isUidAdminFreeTier(uid: string): Promise<boolean> {
  // Critère 1 : allowlist env
  if (!ADMIN_UIDS_ENV.includes(uid)) return false;
  // Critère 2 : runtime vault
  if (!adminVault.has(uid)) return false;
  // Critère 3 : record Firestore flag
  try {
    const user = await db.user.findUnique({
      where: { id: uid },
      select: ['plan', 'role', 'isActive', ADMIN_FREE_TIER_FLAG],
    });
    if (!user) return false;
    if (user.role !== ADMIN_ROLE) return false;
    if (user.plan !== ADMIN_PLAN) return false;
    if (user.isActive !== true) return false;
    // Le flag isGen3iaAdminFreeTier est stocké comme booléen sur le record
    return Boolean((user as Record<string, unknown>)[ADMIN_FREE_TIER_FLAG] === true);
  } catch (err) {
    log.error('admin_free_tier_check_failed', {
      uid,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Retourne le plan effectif d'un utilisateur en tenant compte du free-tier
 * admin. Si l'UID est un admin reconnu, on retourne 'enterprise' avec
 * crédits illimités sans aucune consommation du solde réel.
 */
export async function getEffectivePlan(uid: string): Promise<{
  plan: string;
  credits: number;        // Number.POSITIVE_INFINITY pour admin
  isAdmin: boolean;
  bypassBilling: boolean;
}> {
  const isAdmin = await isUidAdminFreeTier(uid);
  if (isAdmin) {
    return {
      plan: ADMIN_PLAN,
      credits: Number.POSITIVE_INFINITY,
      isAdmin: true,
      bypassBilling: true,
    };
  }

  try {
    const user = await db.user.findUnique({
      where: { id: uid },
      select: ['plan', 'credits'],
    });
    return {
      plan: (user?.plan as string) || 'free',
      credits: (user?.credits as number) ?? 0,
      isAdmin: false,
      bypassBilling: false,
    };
  } catch {
    return { plan: 'free', credits: 0, isAdmin: false, bypassBilling: false };
  }
}

// ============================================================
// Helpers exported for bootstrap-admin.ts
// ============================================================

export const ADMIN_BOOTSTRAP_PLAN = ADMIN_PLAN;
export const ADMIN_BOOTSTRAP_ROLE = ADMIN_ROLE;
