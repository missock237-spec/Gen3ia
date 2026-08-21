// ============================================================
// Gen3ia — Firebase Admin SDK (serveur uniquement)
// ============================================================
//  Singleton initialisé côté serveur uniquement.
//  À importer dans :
//    - les API routes Next.js
//    - le middleware (server-side)
//    - les server components
//    - les workers / cron
// ============================================================

import {
  cert,
  getApps,
  initializeApp,
  type App as FirebaseAdminApp,
} from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage, type Storage } from 'firebase-admin/storage';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';

import {
  FIREBASE_PROJECT_ID,
  FIREBASE_STORAGE_BUCKET,
} from './config';

let adminApp: FirebaseAdminApp | null = null;
let adminAuth: Auth | null = null;
let adminDb: Firestore | null = null;
let adminStorage: Storage | null = null;
let adminMessaging: Messaging | null = null;

/**
 * Construit les credentials Firebase Admin depuis les variables d'environnement.
 * Deux formats supportés :
 *  1. FIREBASE_SERVICE_ACCOUNT (JSON string, recommandé pour Vercel/Render)
 *  2. FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY + FIREBASE_PROJECT_ID
 */
function buildCredential(): ReturnType<typeof cert> | undefined {
  // Format 1 : JSON complet du compte de service
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (saJson && saJson.trim().length > 0) {
    try {
      const parsed = JSON.parse(saJson);
      return cert(parsed);
    } catch (err) {
      console.error('[firebase-admin] FIREBASE_SERVICE_ACCOUNT JSON invalide:', err);
    }
  }

  // Format 2 : variables séparées
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;
  const projectId = process.env.FIREBASE_PROJECT_ID || FIREBASE_PROJECT_ID;

  if (clientEmail && privateKeyRaw && projectId) {
    // Les clés privées stockées en env sont souvent échappées (\n littéral)
    const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
    return cert({ clientEmail, privateKey, projectId });
  }

  return undefined;
}

function initAdminApp(): FirebaseAdminApp {
  if (adminApp) return adminApp;

  if (getApps().length > 0) {
    adminApp = getApps()[0]!;
    return adminApp;
  }

  const credential = buildCredential();
  const projectId = process.env.FIREBASE_PROJECT_ID || FIREBASE_PROJECT_ID;
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || FIREBASE_STORAGE_BUCKET;

  adminApp = initializeApp(
    credential
      ? { credential, projectId, storageBucket }
      : { projectId, storageBucket },
  );
  return adminApp;
}

export function getAdminApp(): FirebaseAdminApp {
  return initAdminApp();
}

export function getAdminAuth(): Auth {
  if (!adminAuth) adminAuth = getAuth(getAdminApp());
  return adminAuth;
}

export function getAdminDb(): Firestore {
  if (!adminDb) {
    const databaseId = process.env.FIREBASE_DATABASE_ID;
    adminDb = databaseId ? getFirestore(getAdminApp(), databaseId) : getFirestore(getAdminApp());
    adminDb.settings({ ignoreUndefinedProperties: true });
  }
  return adminDb;
}

export function getAdminStorage(): Storage {
  if (!adminStorage) adminStorage = getStorage(getAdminApp());
  return adminStorage;
}

export function getAdminMessaging(): Messaging {
  if (!adminMessaging) adminMessaging = getMessaging(getAdminApp());
  return adminMessaging;
}

export const firebaseAdmin = {
  app: getAdminApp,
  auth: getAdminAuth,
  db: getAdminDb,
  storage: getAdminStorage,
  messaging: getAdminMessaging,
};

export default firebaseAdmin;
