// ============================================================
// Gen3ia — Firebase Client SDK (navigateur uniquement)
// ============================================================
//  Singleton initialisé côté client.
//  À importer dans les composants React / hooks / client-side.
//
//  Ordre d'initialisation (Fix 3) :
//    1. getFirebaseApp() — getApps().length === 0 ? initializeApp : getApp
//    2. getFirebaseAuth() — getAuth/initializeAuth AVANT Firestore/Storage/...
//    3. les autres services (db, storage, messaging, analytics) sont lazy
//
//  L'app + auth sont initialisées EAGER au chargement du module pour garantir
//  qu'aucun autre SDK Firebase ne soit utilisé avant l'auth.
// ============================================================

'use client';

import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getMessaging, type Messaging } from 'firebase/messaging';
import { getAnalytics, type Analytics, isSupported } from 'firebase/analytics';

import { firebaseConfig } from './config';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let messaging: Messaging | null = null;
let analytics: Analytics | null = null;

function initApp(): FirebaseApp {
  // Fix 3 : getApps().length === 0 évite les réinitialisations multiples
  // en développement (HMR) et en production (multiple dynamic imports).
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }
  return app;
}

function initAuth(a: FirebaseApp): Auth {
  try {
    // getAuth retourne le singleton Auth déjà initialisé s'il existe.
    return getAuth(a);
  } catch {
    // SSR-safe : initializeAuth accepte une configuration de persistence.
    return initializeAuth(a, { persistence: indexedDBLocalPersistence });
  }
}

export function getFirebaseApp(): FirebaseApp {
  if (!app) app = initApp();
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) auth = initAuth(getFirebaseApp());
  return auth;
}

export function getFirebaseDb(): Firestore {
  if (!db) db = getFirestore(getFirebaseApp(), 'gen3ia');
  return db;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (!storage) storage = getStorage(getFirebaseApp());
  return storage;
}

export async function getFirebaseMessaging(): Promise<Messaging | null> {
  if (typeof window === 'undefined') return null;
  if (!messaging) {
    try {
      const supported = await isSupported();
      if (!supported) return null;
      messaging = getMessaging(getFirebaseApp());
    } catch {
      return null;
    }
  }
  return messaging;
}

export async function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (typeof window === 'undefined') return null;
  if (!analytics) {
    try {
      const supported = await isSupported();
      if (!supported) return null;
      analytics = getAnalytics(getFirebaseApp());
    } catch {
      return null;
    }
  }
  return analytics;
}

// ---------------------------------------------------------------
// Validation de la configuration Firebase côté client.
// Détecte les variables NEXT_PUBLIC_* manquantes AVANT toute tentative
// d'authentification, pour fournir un message d'erreur clair au lieu
// d'une erreur cryptique Firebase.
// ---------------------------------------------------------------
export function isFirebaseClientConfigured(): { ok: boolean; missing: string[] } {
  const required: Array<{ key: string; value: string | undefined }> = [
    { key: 'NEXT_PUBLIC_FIREBASE_API_KEY', value: firebaseConfig.apiKey },
    { key: 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', value: firebaseConfig.authDomain },
    { key: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID', value: firebaseConfig.projectId },
    { key: 'NEXT_PUBLIC_FIREBASE_APP_ID', value: firebaseConfig.appId },
  ];
  const missing = required.filter(r => !r.value).map(r => r.key);
  return { ok: missing.length === 0, missing };
}

let _initError: string | null = null;

/** Retourne l'erreur d'initialisation Firebase si elle s'est produite. */
export function getFirebaseInitError(): string | null {
  return _initError;
}

// ---------------------------------------------------------------
// Initialisation EAGER (Fix 3) :
// On force l'app + l'auth à s'initialiser dès le chargement du module
// pour qu'aucun autre service Firebase (Firestore, Storage, Messaging,
// Analytics) ne puisse être appelé avant que l'Auth ne soit prête.
// Côté serveur (typeof window === 'undefined'), on reste lazy.
// ---------------------------------------------------------------
if (typeof window !== 'undefined') {
  try {
    // Vérifier la config avant d'initialiser
    const configCheck = isFirebaseClientConfigured();
    if (!configCheck.ok) {
      _initError = `Configuration Firebase manquante: ${configCheck.missing.join(', ')}`;
      console.error('[firebase/client]', _initError);
    } else {
      getFirebaseApp();
      getFirebaseAuth();
    }
  } catch (err) {
    _initError = err instanceof Error ? err.message : 'Erreur d\'initialisation Firebase';
    console.error('[firebase/client] eager init failed:', err);
  }
}

export const firebaseClient = {
  app: getFirebaseApp,
  auth: getFirebaseAuth,
  db: getFirebaseDb,
  storage: getFirebaseStorage,
  messaging: getFirebaseMessaging,
  analytics: getFirebaseAnalytics,
};

export default firebaseClient;
