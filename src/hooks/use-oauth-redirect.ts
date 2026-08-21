/**
 * useOAuthRedirect — Hook pour capturer le resultat d'une authentification
 * OAuth par redirect (mobile) au chargement des pages /login et /register.
 *
 * Quand signInWithRedirect est utilise (mobile), la page se recharge
 * apres l'autorisation OAuth. Ce hook appelle getRedirectResult() pour
 * recuperer l'idToken et l'envoyer au serveur.
 *
 * IMPORTANT : On utilise localStorage (pas sessionStorage) car sur
 * Chrome Android, les Custom Tabs ouvrent un processus separe qui
 * perd le sessionStorage. localStorage survive car il est partage
 * par origine (domaine).
 *
 * On lit aussi les parametres URL (?oauth=1) comme fallback si
 * localStorage est aussi vide (ex: Safari IAB).
 *
 * REGLE : aucune sortie silencieuse. Si quelque chose echoue,
 * l'utilisateur voit un message d'erreur clair.
 */

'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// Clefs localStorage persistees entre les onglets/processus
const LS_MODE_KEY = 'gen3ia_oauth_mode';
const LS_PROVIDER_KEY = 'gen3ia_oauth_provider';
const LS_REDIRECTING_KEY = 'gen3ia_oauth_redirecting';
const LS_TIMESTAMP_KEY = 'gen3ia_oauth_timestamp';

// Duree de vie max du contexte OAuth en localStorage (5 min)
const OAUTH_CONTEXT_MAX_AGE_MS = 5 * 60 * 1000;

interface UseOAuthRedirectOptions {
  onError?: (msg: string) => void;
}

/**
 * Sauvegarde le contexte OAuth avant un redirect.
 * Appel depuis OAuthButtons AVANT signInWithRedirect.
 */
export function saveOAuthContext(mode: 'login' | 'register', provider: 'google' | 'github'): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LS_MODE_KEY, mode);
    localStorage.setItem(LS_PROVIDER_KEY, provider);
    localStorage.setItem(LS_REDIRECTING_KEY, 'true');
    localStorage.setItem(LS_TIMESTAMP_KEY, String(Date.now()));
  } catch {
    // localStorage non disponible (private browsing rare)
    // Fallback : parametres URL
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('oauth', '1');
      url.searchParams.set('oauth_mode', mode);
      url.searchParams.set('oauth_provider', provider);
      window.history.replaceState(null, '', url.toString());
    } catch {}
  }
}

/**
 * Nettoie le contexte OAuth apres traitement (succes ou echec).
 */
export function clearOAuthContext(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(LS_MODE_KEY);
    localStorage.removeItem(LS_PROVIDER_KEY);
    localStorage.removeItem(LS_REDIRECTING_KEY);
    localStorage.removeItem(LS_TIMESTAMP_KEY);
  } catch {}
  // Nettoie aussi les parametres URL
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('oauth')) {
      url.searchParams.delete('oauth');
      url.searchParams.delete('oauth_mode');
      url.searchParams.delete('oauth_provider');
      window.history.replaceState(null, '', url.toString());
    }
  } catch {}
}

/**
 * Lit le contexte OAuth depuis localStorage ou URL params.
 * Retourne null si aucun contexte valide n'est trouve.
 */
function readOAuthContext(): { mode: string; provider: string } | null {
  if (typeof window === 'undefined') return null;

  // 1. Essayer localStorage
  try {
    const mode = localStorage.getItem(LS_MODE_KEY);
    const provider = localStorage.getItem(LS_PROVIDER_KEY);
    const timestamp = localStorage.getItem(LS_TIMESTAMP_KEY);

    if (mode && provider) {
      // Verifier que le contexte est recent (< 5 min)
      if (timestamp) {
        const age = Date.now() - parseInt(timestamp, 10);
        if (age > OAUTH_CONTEXT_MAX_AGE_MS) {
          console.warn('[useOAuthRedirect] Stale OAuth context, age:', age, 'ms');
          clearOAuthContext();
          return null;
        }
      }
      return { mode, provider };
    }
  } catch {}

  // 2. Fallback : parametres URL
  try {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('oauth_mode');
    const provider = params.get('oauth_provider');
    if (mode && provider && params.get('oauth') === '1') {
      return { mode, provider };
    }
  } catch {}

  return null;
}

export function useOAuthRedirect({ onError }: UseOAuthRedirectOptions = {}) {
  const router = useRouter();
  const handled = useRef(false);

  const handleRedirectResult = useCallback(async () => {
    if (handled.current) return;
    handled.current = true;

    if (typeof window === 'undefined') return;

    // 1. Lire le contexte OAuth (localStorage ou URL params)
    const ctx = readOAuthContext();
    if (!ctx) return; // Pas de redirect OAuth en attente — c'est normal

    const { mode: oauthMode, provider: oauthProvider } = ctx;
    const providerLabel = oauthProvider === 'google' ? 'Google' : 'GitHub';

    // 2. Nettoyer le contexte immediatement
    clearOAuthContext();

    // 3. Resoudre le resultat du redirect Firebase
    let idToken: string | null = null;
    let displayName: string | null = null;

    try {
      const { resolveOAuthRedirect } = await import('@/lib/firebase/auth-client');
      const authResult = await resolveOAuthRedirect();

      // ✅ CODE CORRIGÉ — Vérifier si le cookie de session existe déjà
if (!authResult) {
  // Vérifier si l'utilisateur est déjà connecté (cookie de session)
  try {
    const meRes = await fetch('/api/auth/me', { credentials: 'include' });
    if (meRes.ok) {
      const meData = await meRes.json();
      if (meData.user) {
        // Déjà connecté — rediriger vers le dashboard
        window.location.href = '/';
        return;
      }
    }
  } catch {}
  
  onError?.(`Connexion ${providerLabel} annulée ou échouée.`);
  return;
}
        // ou erreur Firebase interceptee en silence.
        console.error('[useOAuthRedirect] getRedirectResult returned null');
        onError?.(`Connexion ${providerLabel} annulee ou echouee. Verifiez que le domaine est autorise dans Firebase Console.`);
        return;
      }

      idToken = authResult.idToken;
      displayName = authResult.displayName;
    } catch (err) {
      console.error('[useOAuthRedirect] resolveOAuthRedirect error:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      onError?.(`Erreur lors de la connexion ${providerLabel} : ${errMsg}`);
      return;
    }

    // 4. Envoyer l'idToken au serveur
    try {
      const endpoint = oauthMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          idToken,
          ...(oauthMode === 'register' && displayName ? { name: displayName } : {}),
        }),
      });

      if (!res.ok) {
        let msg = `Erreur lors de la connexion via ${providerLabel}.`;
        try {
          const body = await res.json();
          if (body?.error) msg = body.error;
        } catch {}
        console.error('[useOAuthRedirect] Server error:', res.status, msg);
        onError?.(msg);
        return;
      }

      // 5. Succes — rechargement complet pour lire le cookie de session
      console.log('[useOAuthRedirect] OAuth success, reloading to hydrate session');
      window.location.href = '/';
    } catch (fetchErr) {
      console.error('[useOAuthRedirect] fetch error:', fetchErr);
      onError?.(`Erreur reseau lors de la connexion ${providerLabel}.`);
    }
  }, [router, onError]);

  useEffect(() => {
    handleRedirectResult();
  }, [handleRedirectResult]);
}
