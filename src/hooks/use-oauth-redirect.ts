/**
 * useOAuthRedirect — Hook pour capturer le résultat d'une authentification
 * OAuth par redirect (mobile) au chargement des pages /login et /register.
 *
 * Quand signInWithRedirect est utilisé (mobile), la page se recharge
 * après l'autorisation OAuth. Ce hook appelle getRedirectResult() pour
 * récupérer l'idToken et l'envoyer au serveur.
 *
 * Le mode (login/register) et le provider sont lus depuis sessionStorage,
 * positionnés par OAuthButtons avant le redirect.
 */

'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';

interface UseOAuthRedirectOptions {
  onError?: (msg: string) => void;
}

export function useOAuthRedirect({ onError }: UseOAuthRedirectOptions = {}) {
  const router = useRouter();
  const handled = useRef(false);

  const handleRedirectResult = useCallback(async () => {
    if (handled.current) return;
    handled.current = true;

    if (typeof window === 'undefined') return;

    // Vérifie s'il y a un redirect OAuth en attente
    const oauthMode = sessionStorage.getItem('oauth_mode');
    const oauthProvider = sessionStorage.getItem('oauth_provider');
    if (!oauthMode || !oauthProvider) return;

    // Nettoie le sessionStorage immédiatement
    sessionStorage.removeItem('oauth_mode');
    sessionStorage.removeItem('oauth_provider');

    try {
      const { resolveOAuthRedirect } = await import('@/lib/firebase/auth-client');
      const authResult = await resolveOAuthRedirect();

      if (!authResult) return; // Pas de redirect en attente (ou annulé par l'utilisateur)

      // Envoie l'idToken au serveur
      const endpoint = oauthMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          idToken: authResult.idToken,
          ...(oauthMode === 'register' && authResult.displayName
            ? { name: authResult.displayName }
            : {}),
        }),
      });

      if (!res.ok) {
        let msg = 'Erreur lors de la connexion.';
        try {
          const body = await res.json();
          if (body?.error) msg = body.error;
        } catch {}
        onError?.(msg);
        return;
      }

      // Succès — recharge complet pour lire le nouveau cookie de session
      // (router.push ne suffit pas car le cookie n'est pas visible
      // dans le store zustand avant un rechargement)
      window.location.href = '/';
    } catch (err) {
      console.error('[useOAuthRedirect] Error:', err);
      onError?.('Erreur lors de la connexion via ' + oauthProvider + '.');
    }
  }, [router, onError]);

  useEffect(() => {
    handleRedirectResult();
  }, [handleRedirectResult]);
}
