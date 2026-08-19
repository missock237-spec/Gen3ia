// ============================================================
// Gen3ia — Bootstrap Admin Account (one-shot, secure)
// ============================================================
//  Ce script crée le compte administrateur maître du projet.
//  Il doit être exécuté une seule fois (re-exécutable sans risque,
//  il détecte et met à jour un compte existant).
//
//  PRÉ-REQUIS ENV (tous obligatoires — deny-by-default) :
//    ADMIN_BOOTSTRAP_EMAIL     — email du compte admin
//    ADMIN_BOOTSTRAP_PASSWORD  — mot de passe (min 16 chars, complexe)
//    ADMIN_BOOTSTRAP_CODE      — code confidentiel secret (min 32 chars)
//                                stocké uniquement sous forme de hash
//                                dans le runtime vault — jamais en clair,
//                                jamais loggué
//    ADMIN_BOOTSTRAP_NAME       — nom d'affichage du compte admin
//    ADMIN_BOOTSTRAP_UIDS      — (sera rempli par le script si absent)
//                                liste des UIDs admin autorisés
//
//  + Variables Firebase Admin (déjà requises par le projet) :
//    FIREBASE_PROJECT_ID
//    FIREBASE_CLIENT_EMAIL
//    FIREBASE_PRIVATE_KEY
//
//  ACTIONS EFFECTUÉES :
//    1. Vérification de la complexité des secrets (refuse si faible)
//    2. Création/mise à jour de l'utilisateur Firebase Auth
//       (emailVerified=true, disabled=false)
//    3. Pose de la custom claim {role:'admin'} sur le compte Firebase
//    4. Création/mise à jour du record Firestore User avec :
//         role='admin', plan='enterprise', credits=Number.POSITIVE_INFINITY,
//         isActive=true, isEmailVerified=true, isGen3iaAdminFreeTier=true
//    5. Création d'un Subscription perpétuel :
//         plan='enterprise', status='active', autoRenew=true,
//         provider='gen3ia-admin', providerSubscriptionId='admin-perpetual',
//         endDate=null, renewalDate=null
//    6. Ajoute l'UID à ADMIN_BOOTSTRAP_UIDS (variable d'env, à reporter
//       manuellement dans .env.production pour la persistance)
//    7. Enregistre l'UID + hash(code) dans le runtime vault du serveur
//       (via src/lib/admin-account.ts:registerAdminInVault)
//    8. Écrit un audit log Firestore (sans divulguer les secrets)
//
//  JAMAIS :
//    - Afficher le mot de passe ou le code en clair
//    - Logger les secrets
//    - Sortir le code dans une réponse HTTP
//
//  USAGE :
//    node --import tsx scripts/bootstrap-admin.ts
//    (ou : npx tsx scripts/bootstrap-admin.ts)
// ============================================================

import { getAdminAuth, getAdminDb } from '../src/lib/firebase/admin';
import { registerAdminInVault, ADMIN_BOOTSTRAP_PLAN, ADMIN_BOOTSTRAP_ROLE, ADMIN_FREE_TIER_FLAG } from '../src/lib/admin-account';
import { createLogger } from '../src/lib/logger';

const log = createLogger('bootstrap-admin');

// ============================================================
// 0. Lecture + validation des secrets env
// ============================================================

const ADMIN_EMAIL = process.env.ADMIN_BOOTSTRAP_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_BOOTSTRAP_PASSWORD;
const ADMIN_CODE = process.env.ADMIN_BOOTSTRAP_CODE;
const ADMIN_NAME = process.env.ADMIN_BOOTSTRAP_NAME || 'Gen3ia Admin';
const ADMIN_UIDS_ENV = (process.env.ADMIN_BOOTSTRAP_UIDS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

function fail(msg: string): never {
  console.error(`[bootstrap-admin] FATAL: ${msg}`);
  process.exit(1);
}

function assertSecrets() {
  if (!ADMIN_EMAIL || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ADMIN_EMAIL)) {
    fail('ADMIN_BOOTSTRAP_EMAIL manquant ou invalide.');
  }
  if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 16) {
    fail('ADMIN_BOOTSTRAP_PASSWORD manquant ou trop court (min 16 chars).');
  }
  // Complexité du mot de passe
  const pwd = ADMIN_PASSWORD;
  let complexity = 0;
  if (/[a-z]/.test(pwd)) complexity++;
  if (/[A-Z]/.test(pwd)) complexity++;
  if (/[0-9]/.test(pwd)) complexity++;
  if (/[^a-zA-Z0-9]/.test(pwd)) complexity++;
  if (complexity < 3) {
    fail('ADMIN_BOOTSTRAP_PASSWORD trop faible (3/4 classes requises: majuscules, minuscules, chiffres, symboles).');
  }
  if (!ADMIN_CODE || ADMIN_CODE.length < 32) {
    fail('ADMIN_BOOTSTRAP_CODE manquant ou trop court (min 32 chars).');
  }
  // Le code ne doit PAS être un mot du dictionnaire évident
  if (/^(.)\1{31,}$/.test(ADMIN_CODE)) {
    fail('ADMIN_BOOTSTRAP_CODE trop prévisible (caractères répétés).');
  }
}

assertSecrets();

// ============================================================
// 1. Création/mise à jour Firebase Auth
// ============================================================

async function upsertFirebaseAuthUser(): Promise<string> {
  const auth = getAdminAuth();
  let uid: string;

  try {
    // Tentative de récupération par email
    const existing = await auth.getUserByEmail(ADMIN_EMAIL!);
    uid = existing.uid;
    log.info('bootstrap_admin_firebase_user_exists', { uid });
    // Mise à jour du mot de passe + propriétés
    await auth.updateUser(uid, {
      password: ADMIN_PASSWORD,
      displayName: ADMIN_NAME,
      emailVerified: true,
      disabled: false,
    });
  } catch (err: unknown) {
    // Utilisateur inexistant → on le crée
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'auth/user-not-found') {
      const created = await auth.createUser({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        displayName: ADMIN_NAME,
        emailVerified: true,
        disabled: false,
      });
      uid = created.uid;
      log.info('bootstrap_admin_firebase_user_created', { uid });
    } else {
      throw err;
    }
  }

  // Pose de la custom claim admin (idempotent)
  await auth.setCustomUserClaims(uid, {
    role: ADMIN_BOOTSTRAP_ROLE,
    plan: ADMIN_BOOTSTRAP_PLAN,
    adminTier: 'master',
    freeTier: true,
  });
  log.info('bootstrap_admin_custom_claims_set', { uid, role: ADMIN_BOOTSTRAP_ROLE });

  return uid;
}

// ============================================================
// 2. Record Firestore User
// ============================================================

async function upsertFirestoreUserRecord(uid: string): Promise<void> {
  const db = getAdminDb();
  const userRef = db.collection('users').doc(uid);
  const now = new Date();

  // On lit l'existant pour préserver createdAt
  const snap = await userRef.get();
  const exists = snap.exists;
  const existing = snap.data() || {};

  await userRef.set({
    id: uid,
    email: ADMIN_EMAIL!.toLowerCase(),
    name: ADMIN_NAME,
    role: ADMIN_BOOTSTRAP_ROLE,
    plan: ADMIN_BOOTSTRAP_PLAN,
    credits: Number.POSITIVE_INFINITY, // illimité
    isActive: true,
    isEmailVerified: true,
    isCreator: true, // l'admin est aussi créateur (marketplace)
    creatorEarnings: 0,
    creatorWithdrawn: 0,
    isTwoFactorEnabled: false,
    // Flag confidentiel free-tier admin (court-circuite billing)
    [ADMIN_FREE_TIER_FLAG]: true,
    // Préserver createdAt si existe, sinon now
    createdAt: existing.createdAt ?? now,
    updatedAt: now,
    lastActiveAt: now,
  }, { merge: true });

  log.info('bootstrap_admin_firestore_user_upserted', { uid, exists });
}

// ============================================================
// 3. Subscription perpétuel
// ============================================================

async function upsertPerpetualSubscription(uid: string): Promise<void> {
  const db = getAdminDb();
  const subRef = db.collection('subscriptions').doc(uid); // 1 sub par user
  const now = new Date();

  await subRef.set({
    id: uid,
    userId: uid,
    plan: ADMIN_BOOTSTRAP_PLAN,
    status: 'active',
    startDate: now,
    // endDate=null + autoRenew=true → jamais expiré
    endDate: null,
    renewalDate: null,
    provider: 'gen3ia-admin',
    providerSubscriptionId: `admin-perpetual-${uid.slice(0, 12)}`,
    autoRenew: true,
    createdAt: now,
    updatedAt: now,
  }, { merge: true });

  log.info('bootstrap_admin_subscription_upserted', { uid });
}

// ============================================================
// 4. Audit log (sans secrets)
// ============================================================

async function writeAuditLog(uid: string): Promise<void> {
  const db = getAdminDb();
  const auditRef = db.collection('audit_logs').doc();
  await auditRef.set({
    id: auditRef.id,
    userId: uid,
    action: 'admin_bootstrap',
    category: 'admin',
    severity: 'info',
    details: 'Compte admin maître créé/mis à jour via bootstrap-admin.ts',
    createdAt: new Date(),
    // PAS de mot de passe, PAS de code, PAS d'email en clair
  });

  log.info('bootstrap_admin_audit_logged', { auditId: auditRef.id });
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log('============================================================');
  console.log(' Gen3ia — Bootstrap Admin Account');
  console.log('============================================================');
  console.log(` Email   : ${ADMIN_EMAIL}`);
  console.log(` Name    : ${ADMIN_NAME}`);
  console.log(' Password : [REDACTED]');
  console.log(' Code     : [REDACTED]');
  console.log('============================================================\n');

  try {
    // 1. Firebase Auth user + custom claims
    const uid = await upsertFirebaseAuthUser();

    // 2. Record Firestore User (plan=enterprise, credits=Infinity)
    await upsertFirestoreUserRecord(uid);

    // 3. Subscription perpétuel (autoRenew=true, endDate=null)
    await upsertPerpetualSubscription(uid);

    // 4. Audit log (sans secrets)
    await writeAuditLog(uid);

    // 5. Enregistrement dans le runtime vault du serveur (hash du code)
    registerAdminInVault({
      uid,
      email: ADMIN_EMAIL!.toLowerCase(),
      confidentialCode: ADMIN_CODE!,
    });

    // 6. Affichage du résumé final (sans secrets)
    const newUids = Array.from(new Set([...ADMIN_UIDS_ENV, uid]));
    console.log('\n============================================================');
    console.log(' BOOTSTRAP COMPLETED SUCCESSFULLY');
    console.log('============================================================');
    console.log(` Admin UID         : ${uid}`);
    console.log(` Admin email       : ${ADMIN_EMAIL}`);
    console.log(` Custom claims     : { role: 'admin', plan: 'enterprise', adminTier: 'master', freeTier: true }`);
    console.log(` Firestore user    : plan=enterprise, credits=Infinity, isActive=true`);
    console.log(` Subscription      : status=active, autoRenew=true, endDate=null (perpétuel)`);
    console.log(` Runtime vault     : hash(code) registered for UID ${uid}`);
    console.log(' Audit log        : written to audit_logs collection');
    console.log('\n============================================================');
    console.log(' ⚠️  ACTION MANUELLE REQUISE — .env.production');
    console.log('============================================================');
    console.log(`Ajoutez la variable suivante dans votre .env.production :`);
    console.log();
    console.log(`ADMIN_BOOTSTRAP_UIDS=${newUids.join(',')}`);
    console.log();
    console.log('Puis redeployez le serveur pour que le runtime vault reconnaisse');
    console.log('cet UID comme admin autorisé (deny-by-default tant que absent).');
    console.log('\n============================================================');
  } catch (err) {
    console.error('\n[bootstrap-admin] ERREUR:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[bootstrap-admin] Uncaught error:', err);
  process.exit(1);
});
