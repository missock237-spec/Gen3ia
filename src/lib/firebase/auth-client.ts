// ============================================================
// Gen3ia — Client-side Firebase Auth helpers
// ============================================================
//  Utilitaires pour les composants React côté client.
//  Logique : signIn côté client -> obtention ID token -> POST au
//  serveur qui crée le session cookie Firebase.
// ============================================================

'use client';

import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  GoogleAuthProvider,
  GithubAuthProvider,
  type UserCredential,
} from 'firebase/auth';

import { getFirebaseAuth } from '@/lib/firebase/client';

export interface AuthResult {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  idToken: string;
}

async function buildAuthResult(cred: UserCredential): Promise<AuthResult> {
  const idToken = await cred.user.getIdToken();
  return {
    uid: cred.user.uid,
    email: cred.user.email,
    displayName: cred.user.displayName,
    photoURL: cred.user.photoURL,
    emailVerified: cred.user.emailVerified,
    idToken,
  };
}

/**
 * Connexion par email + mot de passe.
 * Retourne un ID token à envoyer au serveur (POST /api/auth/login).
 */
export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  const auth = getFirebaseAuth();
  const cred = await signInWithEmailAndPassword(auth, email.toLowerCase().trim(), password);
  return buildAuthResult(cred);
}

/**
 * Inscription par email + mot de passe.
 * Crée le compte Firebase Auth, met à jour le displayName, et envoie
 * l'email de vérification. Retourne un ID token à envoyer au serveur
 * (POST /api/auth/register).
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  displayName?: string,
): Promise<AuthResult> {
  const auth = getFirebaseAuth();
  const cred = await createUserWithEmailAndPassword(auth, email.toLowerCase().trim(), password);
  if (displayName) {
    await updateProfile(cred.user, { displayName });
  }
  // Envoie l'email de vérification (non bloquant)
  sendEmailVerification(cred.user, { url: window.location.origin + '/dashboard' }).catch(() => {});
  return buildAuthResult(cred);
}

/**
 * Connexion Google via popup.
 */
export async function signInWithGoogle(): Promise<AuthResult> {
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  return buildAuthResult(cred);
}

/**
 * Connexion GitHub via popup.
 */
export async function signInWithGithub(): Promise<AuthResult> {
  const auth = getFirebaseAuth();
  const provider = new GithubAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  return buildAuthResult(cred);
}

/**
 * Demande de reset password côté client (envoie directement l'email).
 */
export async function sendPasswordReset(email: string): Promise<void> {
  const auth = getFirebaseAuth();
  await sendPasswordResetEmail(auth, email.toLowerCase().trim(), {
    url: window.location.origin + '/login',
  });
}

/**
 * Déconnexion côté client. Le serveur est appelé séparément pour
 * invalider le session cookie.
 */
export async function signOutClient(): Promise<void> {
  const auth = getFirebaseAuth();
  await firebaseSignOut(auth);
}
