/**
 * useOAuthRedirect — Hook pour capturer le resultat d'une authentification
 * OAuth par redirect (mobile) au chargement des pages /login et /register.
 */

'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const LS_MODE_KEY = 'gen3ia_oauth_mode';
const LS_PROVIDER_KEY = 'gen3ia_oauth_provider';
const LS_TIMESTAMP_KEY = 'gen3ia_oauth_timestamp';
const OAUTH_CONTEXT_MAX_AGE_MS = 5 * 60 * 1000;

interface UseOAuthRedirectOptions {
  onError?: (msg: string) => void;
}

export function saveOAuthContext(mode: 'login' | 'register', provider: 'google' | 'github'): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LS_MODE_KEY, mode);
    localStorage.setItem(LS_PROVIDER_KEY, provider);
    localStorage.setItem(LS_TIMESTAMP_KEY, String(Date.now()));
  } catch {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('oauth', '1');
      url.searchParams.set('oauth_mode', mode);
      url.searchParams.set('oauth_provider', provider);
      window.history.replaceState(null, '', url.toString());
    } catch {}
  }
}

export function clearOAuthContext(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(LS_MODE_KEY);
    localStorage.removeItem(LS_PROVIDER_KEY);
    localStorage.removeItem(LS_TIMESTAMP_KEY);
  } catch {}
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

function readOAuthContext(): { mode: string; provider: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const mode = localStorage.getItem(LS_MODE_KEY);
    const provider = localStorage.getItem(LS_PROVIDER_KEY);
    const timestamp = localStorage.getItem(LS_TIMESTAMP_KEY);
    if (mode && provider) {
      if (timestamp) {
        const age = Date.now() - parseInt(timestamp, 10);
        if (age > OAUTH_CONTEXT_MAX_AGE_MS) {
          clearOAuthContext();
          return null;
        }
      }
      return { mode, provider };
    }
  } catch {}
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

    const ctx = readOAuthContext();
    if (!ctx) return;

    const { mode: oauthMode, provider: oauthProvider } = ctx;
    const providerLabel = oauthProvider === 'google' ? 'Google' : 'GitHub';
    clearOAuthContext();

    let idToken: string | null = null;
    let displayName: string | null = null;

    try {
      const { resolveOAuthRedirect } = await import('@/lib/firebase/auth-client');
      const authResult = await resolveOAuthRedirect();
      if (!authResult) {
        console.error('[useOAuthRedirect] getRedirectResult returned null');
        onError?.(`Connexion ${providerLabel} annulee ou echouee.`);
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
        onError?.(msg);
        return;
      }
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
