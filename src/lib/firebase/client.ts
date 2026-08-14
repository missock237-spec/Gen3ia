// ============================================================
// Gen3ia — Firebase Client SDK (navigateur uniquement)
// ============================================================
//  Singleton initialisé côté client.
//  À importer dans les composants React / hooks / client-side.
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

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;
let messaging: Messaging | null = null;
let analytics: Analytics | null = null;

function initApp(): FirebaseApp {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }
  return app;
}

function initAuth(a: FirebaseApp): Auth {
  try {
    return getAuth(a);
  } catch {
    // SSR-safe : initializeAuth accepte une configuration de persistence
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

export const firebaseClient = {
  app: getFirebaseApp,
  auth: getFirebaseAuth,
  db: getFirebaseDb,
  storage: getFirebaseStorage,
  messaging: getFirebaseMessaging,
  analytics: getFirebaseAnalytics,
};

export default firebaseClient;
