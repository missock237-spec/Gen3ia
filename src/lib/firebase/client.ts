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
  if (!db) db = getFirestore(getFirebaseApp());
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
// Initialisation EAGER (Fix 3) :
// On force l'app + l'auth à s'initialiser dès le chargement du module
// pour qu'aucun autre service Firebase (Firestore, Storage, Messaging,
// Analytics) ne puisse être appelé avant que l'Auth ne soit prête.
// Côté serveur (typeof window === 'undefined'), on reste lazy.
// ---------------------------------------------------------------
if (typeof window !== 'undefined') {
  try {
    getFirebaseApp();
    getFirebaseAuth();
  } catch (err) {
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
