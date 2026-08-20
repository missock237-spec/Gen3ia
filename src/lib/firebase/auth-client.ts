// ============================================================
// Gen3ia — Client-side Firebase Auth helpers
// ============================================================
//  Utilitaires pour les composants React côté client.
//  Logique : signIn côté client -> obtention ID token -> POST au
//  serveur qui crée le session cookie Firebase.
//
//  Mobile support : signInWithRedirect est utilisé sur mobile
//  (où les popups sont mal supportés). Le résultat est capturé
//  via getRedirectResult au retour sur la page.
// ============================================================

'use client';

import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  updateProfile,
  GoogleAuthProvider,
  GithubAuthProvider,
  type UserCredential,
} from 'firebase/auth';

import { getFirebaseAuth, isFirebaseClientConfigured, getFirebaseInitError } from '@/lib/firebase/client';

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
 * Détecte si l'appareil est mobile (tactile + petit écran).
 * Sur mobile, les popups OAuth sont souvent bloqués ou se ferment
 * immédiatement — il faut utiliser signInWithRedirect à la place.
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isMobileUA = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(ua);
  const isSmallScreen = window.innerWidth < 768;
  return (hasTouchScreen && isMobileUA) || (hasTouchScreen && isSmallScreen);
}

/**
 * Vérifie que Firebase est correctement configuré côté client.
 * Lance une erreur descriptive si la config est manquante ou si
 * l'initialisation a échoué.
 */
function assertFirebaseReady(): void {
  const initErr = getFirebaseInitError();
  if (initErr) {
    throw { code: 'auth/configuration-not-found', message: initErr };
  }
  const configCheck = isFirebaseClientConfigured();
  if (!configCheck.ok) {
    throw {
      code: 'auth/configuration-not-found',
      message: `Configuration Firebase manquante: ${configCheck.missing.join(', ')}`,
    };
  }
}

/**
 * Connexion par email + mot de passe.
 * Retourne un ID token à envoyer au serveur (POST /api/auth/login).
 */
export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  assertFirebaseReady();
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
  assertFirebaseReady();
  const auth = getFirebaseAuth();
  const cred = await createUserWithEmailAndPassword(auth, email.toLowerCase().trim(), password);
  if (displayName) {
    await updateProfile(cred.user, { displayName });
  }
  // Envoie l'email de vérification (non bloquant)
try {
  await sendEmailVerification(cred.user, { 
    url: window.location.origin + '/dashboard' 
  });
} catch (err) {
  console.error('[signUpWithEmail] Failed to send verification email:', err);
  // Optionnel : notifier l'utilisateur que l'email n'a pas pu être envoyé
  // mais ne pas bloquer l'inscription
}
  return buildAuthResult(cred);
}

/**
 * Connexion Google — popup sur desktop, redirect sur mobile.
 */
export async function signInWithGoogle(): Promise<AuthResult> {
  assertFirebaseReady();
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();

  if (isMobileDevice()) {
    // Sur mobile, on redirige vers la page d'autorisation Google.
    // Le résultat est récupéré via getRedirectResult() au retour.
    await signInWithRedirect(auth, provider);
    // signInWithRedirect ne revient jamais ici (la page se recharge),
    // mais TypeScript exige un retour. On lance pour satisfaire le type.
    throw { code: 'auth/redirect', message: 'Redirection en cours...' };
  }

  const cred = await signInWithPopup(auth, provider);
  return buildAuthResult(cred);
}

/**
 * Connexion GitHub — popup sur desktop, redirect sur mobile.
 */
export async function signInWithGithub(): Promise<AuthResult> {
  assertFirebaseReady();
  const auth = getFirebaseAuth();
  const provider = new GithubAuthProvider();

  if (isMobileDevice()) {
    await signInWithRedirect(auth, provider);
    throw { code: 'auth/redirect', message: 'Redirection en cours...' };
  }

  const cred = await signInWithPopup(auth, provider);
  return buildAuthResult(cred);
}

/**
 * Récupère le résultat d'une authentification par redirect (mobile).
 * À appeler au chargement des pages /login et /register.
 * Retourne null s'il n'y a pas de résultat de redirect en attente.
 */
export async function resolveOAuthRedirect(): Promise<AuthResult | null> {
  if (typeof window === 'undefined') return null;
  try {
    const auth = getFirebaseAuth();
    const result = await getRedirectResult(auth);
    if (!result) return null;
    return buildAuthResult(result);
  } catch (err) {
    // Erreurs connues de redirect — on loggue mais on ne crash pas
    if (err && typeof err === 'object' && 'code' in err) {
      const code = (err as { code: string }).code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return null; // L'utilisateur a annulé, pas une erreur technique
      }
      console.error('[auth] getRedirectResult error:', code, err);
    } else {
      console.error('[auth] getRedirectResult error:', err);
    }
    return null;
  }
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
