// ============================================================
// Gen3ia — Firebase configuration (shared client + admin)
// ============================================================
//  Toutes les valeurs proviennent des variables d'environnement.
//  Les variables NEXT_PUBLIC_* sont exposées au navigateur,
//  les autres restent serveur-only (Firebase Admin SDK).
// ============================================================

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
} as const;

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId || '';
export const FIREBASE_STORAGE_BUCKET = firebaseConfig.storageBucket || '';

// Durée de vie du cookie de session Firebase (14 jours par défaut)
export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 14;

// Durée de vie courte du cookie de session Firebase (24 heures)
export const SESSION_COOKIE_MAX_AGE_SHORT = 60 * 60 * 24;

// Nom du cookie contenant le session token Firebase
export const SESSION_COOKIE_NAME = 'gen3ia_session';

// Validation au démarrage (build-safe)
export function validateFirebaseConfig(): { valid: boolean; missing: string[] } {
  const required = ['apiKey', 'authDomain', 'projectId', 'appId'] as const;
  const missing = required.filter((k) => !firebaseConfig[k]);
  return { valid: missing.length === 0, missing };
}
