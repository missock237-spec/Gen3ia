// ============================================================
// Gen3ia — Système d'auto-update client
// ============================================================
// Ce module gère la détection de nouvelles versions de l'application
// via deux mécanismes complémentaires :
//
// 1. Service Worker : quand le SW détecte un nouveau fichier sw.js,
//    il notifie le client via postMessage (SW_UPDATE_AVAILABLE).
//    Le client peut alors choisir d'activer le nouveau SW.
//
// 2. Polling /api/app-version : toutes les POLL_INTERVAL_MS, le client
//    compare son buildId avec celui du serveur. Si différent, une mise à
//    jour est disponible.
//
// Deux niveaux de sévérité :
//   - updateAvailable (soft) : nouvelle version, l'utilisateur peut recharger
//   - forceUpdate (hard) : version trop ancienne, le rechargement est obligatoire
//
// Le système de snooze permet de repousser la notification soft.
// Les notifications forceUpdate ne sont jamais snoozables.
// ============================================================

import { useSyncExternalStore, useCallback, useEffect, useRef, useState } from 'react';

// --- Configuration ---

/** Intervalle de polling de /api/app-version (ms) */
const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

/** Délai minimum entre deux polls pour éviter les bursts (ms) */
const POLL_THROTTLE_MS = 30 * 1000; // 30 secondes

/** Délai avant de ré-afficher la notification après un snooze (ms) */
const SNOOZE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

/** Délai avant de réessayer un rechargement qui a échoué (ms) */
const RELOAD_RETRY_DELAY_MS = 5 * 60 * 1000; // 5 minutes

/** Clé localStorage pour le snooze */
const SNOOZE_STORAGE_KEY = 'gen3ia-update-snooze';

/** Clé localStorage pour le dernier buildId connu */
const BUILD_ID_STORAGE_KEY = 'gen3ia-build-id';

// --- Types ---

export type UpdateSeverity = 'none' | 'available' | 'forced';

export interface UpdateState {
  severity: UpdateSeverity;
  /** Description lisible de la mise à jour */
  message: string;
  /** Version disponible sur le serveur */
  serverVersion: string;
  /** Version actuelle du client */
  clientVersion: string;
  /** SHA du build serveur */
  serverBuildId: string;
  /** Si true, le rechargement est en cours */
  isReloading: boolean;
  /** Si true, une erreur de rechargement s'est produite */
  reloadError: boolean;
  /** Nombre de tentatives de rechargement */
  reloadAttempts: number;
}

interface ServerVersionResponse {
  version: string;
  gitSha: string;
  buildId: string;
  buildTime: string;
  forceUpdate: boolean;
  minSupportedVersion?: string;
  updateAvailable: boolean;
}

// --- Build info (injecté au build par prebuild.js) ---

const CLIENT_VERSION = typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_APP_VERSION
  ? process.env.NEXT_PUBLIC_APP_VERSION
  : '';

const CLIENT_BUILD_ID = typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BUILD_ID
  ? process.env.NEXT_PUBLIC_BUILD_ID
  : '';

// --- État global (singletons, hors React pour les callbacks SW) ---

const listeners = new Set<() => void>();
let currentUpdateState: UpdateState = {
  severity: 'none',
  message: '',
  serverVersion: '',
  clientVersion: CLIENT_VERSION,
  serverBuildId: '',
  isReloading: false,
  reloadError: false,
  reloadAttempts: 0,
};

let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastPollTime = 0;
let isPolling = false;
let swRegistration: ServiceWorkerRegistration | null = null;
let waitingWorker: ServiceWorker | null = null;

function emitChange() {
  for (const listener of listeners) listener();
}

function updateState(partial: Partial<UpdateState>) {
  currentUpdateState = { ...currentUpdateState, ...partial };
  emitChange();
}

function isSnoozed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const snoozedUntil = localStorage.getItem(SNOOZE_STORAGE_KEY);
    if (!snoozedUntil) return false;
    return Date.now() < parseInt(snoozedUntil, 10);
  } catch {
    return false;
  }
}

// --- Logique de polling ---

async function checkForUpdate(): Promise<void> {
  if (isPolling) return;
  if (Date.now() - lastPollTime < POLL_THROTTLE_MS) return;

  // Ne pas vérifier si l'utilisateur est inactif (page en arrière-plan)
  if (typeof document !== 'undefined' && document.hidden) return;

  // Ne pas vérifier si on est déjà en train de recharger
  if (currentUpdateState.isReloading) return;

  // Ne pas vérifier si déjà en état forced (on ne peut pas faire plus)
  if (currentUpdateState.severity === 'forced') return;

  isPolling = true;
  lastPollTime = Date.now();

  try {
    const params = new URLSearchParams();
    if (CLIENT_VERSION) params.set('v', CLIENT_VERSION);
    if (CLIENT_BUILD_ID) params.set('buildId', CLIENT_BUILD_ID);

    const response = await fetch(`/api/app-version?${params}`);
    if (!response.ok) return;

    const data: ServerVersionResponse = await response.json();

    // Cas 1 : Mise à jour forcée par le serveur
    if (data.forceUpdate) {
      updateState({
        severity: 'forced',
        message: `Version ${data.minSupportedVersion || data.version} requise. Votre version (${CLIENT_VERSION}) n'est plus supportée.`,
        serverVersion: data.version,
        serverBuildId: data.buildId,
      });
      return;
    }

    // Cas 2 : Nouveau buildId détecté
    if (data.updateAvailable && CLIENT_BUILD_ID && !isSnoozed()) {
      updateState({
        severity: 'available',
        message: `Une nouvelle version (${data.version}) est disponible.`,
        serverVersion: data.version,
        serverBuildId: data.buildId,
      });
      return;
    }

    // Cas 3 : Le snooze a expiré et une mise à jour est toujours disponible
    if (data.updateAvailable && CLIENT_BUILD_ID && isSnoozed()) {
      // Le snooze est encore actif, on ne fait rien
      return;
    }

    // Pas de mise à jour — réinitialiser l'état si on était en 'available'
    if (currentUpdateState.severity === 'available') {
      updateState({ severity: 'none', message: '', serverVersion: '', serverBuildId: '' });
    }

    // Sauvegarder le buildId actuel
    if (data.buildId && typeof localStorage !== 'undefined') {
      try { localStorage.setItem(BUILD_ID_STORAGE_KEY, data.buildId); } catch { /* quota */ }
    }
  } catch (err) {
    // Silencieux — les erreurs réseau ne doivent pas spammer la console
    if (process.env.NODE_ENV === 'development') {
      console.warn('[auto-update] Poll failed:', err);
    }
  } finally {
    isPolling = false;
  }
}

// --- Logique de rechargement ---

async function performReload(): Promise<void> {
  if (currentUpdateState.isReloading) return;

  updateState({ isReloading: true, reloadError: false, reloadAttempts: currentUpdateState.reloadAttempts + 1 });

  try {
    // Si un nouveau SW est en attente, l'activer d'abord
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      // Attendre que le SW s'active, puis recharger
      await new Promise<void>((resolve) => {
        if (!swRegistration) { resolve(); return; }
        const handler = (reg: ServiceWorkerRegistration) => {
          navigator.serviceWorker.removeEventListener('controllerchange', handler as EventListener);
          resolve();
        };
        navigator.serviceWorker.addEventListener('controllerchange', handler as EventListener);
        // Timeout de sécurité (5s)
        setTimeout(resolve, 5000);
      });
    }

    // Rechargement avec cache-busting pour forcer le téléchargement
    window.location.href = window.location.href.split('?')[0] + `?_v=${Date.now()}`;
  } catch (err) {
    console.error('[auto-update] Reload failed:', err);
    updateState({ isReloading: false, reloadError: true });

    // Réessayer automatiquement après un délai
    setTimeout(() => {
      if (currentUpdateState.reloadError) {
        updateState({ reloadError: false });
        performReload();
      }
    }, RELOAD_RETRY_DELAY_MS);
  }
}

// --- Logique Service Worker ---

function setupServiceWorkerListeners(registration: ServiceWorkerRegistration): void {
  swRegistration = registration;

  // Quand un nouveau SW est trouvé et en attente d'activation
  registration.addEventListener('updatefound', () => {
    const newWorker = registration.installing;
    if (!newWorker) return;

    newWorker.addEventListener('statechange', () => {
      if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
        // Un nouveau SW est prêt mais pas encore actif
        waitingWorker = newWorker;
        // Déclencher une vérification de version pour confirmer
        checkForUpdate();
      }
    });
  });

  // Quand le SW actif change (après skipWaiting)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Le rechargement est géré par performReload si déclenché manuellement
    // Si c'est un changement silencieux (ex: on navigue), on reload automatiquement
    if (!currentUpdateState.isReloading) {
      window.location.reload();
    }
  });

  // Écouter les messages du SW
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'SW_UPDATE_AVAILABLE') {
      // Le SW nous informe qu'une mise à jour est prête
      checkForUpdate();
    }
  });

  // Vérifier immédiatement s'il y a un SW en attente
  if (registration.waiting) {
    waitingWorker = registration.waiting;
    checkForUpdate();
  }
}

// --- Initialisation ---

function startPolling(): void {
  if (pollTimer) return;

  // Première vérification immédiate (après 3s pour ne pas bloquer le load)
  setTimeout(checkForUpdate, 3000);

  // Puis polling régulier
  pollTimer = setInterval(checkForUpdate, POLL_INTERVAL_MS);

  // Vérifier quand l'utilisateur revient sur la page (visibility change)
  const handleVisibility = () => {
    if (!document.hidden) {
      // Réinitialiser le throttle pour permettre un poll immédiat
      lastPollTime = 0;
      checkForUpdate();
    }
  };

  document.addEventListener('visibilitychange', handleVisibility);

  // Nettoyer au déchargement
  window.addEventListener('beforeunload', () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    document.removeEventListener('visibilitychange', handleVisibility);
  });
}

export function initAutoUpdate(): void {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  // Enregistre le SW avec un paramètre de version pour forcer le navigateur
  // à re-vérifier le fichier sw.js à chaque chargement de page.
  // Sans ce paramètre, le navigateur peut utiliser un sw.js en cache HTTP
  // pendant des heures, empêchant la détection des mises à jour.
  const swUrl = '/sw.js?v=gen3ia-v6';

  navigator.serviceWorker
    .register(swUrl, { updateViaCache: 'none' })
    .then((reg) => {
      setupServiceWorkerListeners(reg);
      startPolling();
    })
    .catch((err) => {
      // En cas d'erreur d'enregistrement SW, le polling fonctionne toujours
      console.warn('[auto-update] SW registration failed, using polling only:', err);
      startPolling();
    });
}

// --- React Hook ---

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => { listeners.delete(callback); };
}

function getSnapshot(): UpdateState {
  return currentUpdateState;
}

function getServerSnapshot(): UpdateState {
  return {
    severity: 'none',
    message: '',
    serverVersion: '',
    clientVersion: CLIENT_VERSION,
    serverBuildId: '',
    isReloading: false,
    reloadError: false,
    reloadAttempts: 0,
  };
}

export function useAutoUpdate(): UpdateState & {
  reload: () => void;
  snooze: () => void;
  dismiss: () => void;
} {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const reload = useCallback(() => {
    performReload();
  }, []);

  const snooze = useCallback(() => {
    if (currentUpdateState.severity !== 'available') return;
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(SNOOZE_STORAGE_KEY, String(Date.now() + SNOOZE_DURATION_MS));
    } catch { /* quota */ }
    updateState({ severity: 'none', message: '' });
  }, []);

  const dismiss = useCallback(() => {
    // Dismiss = snooze + ne plus vérifier pendant cette session
    if (currentUpdateState.severity === 'forced') return; // ne peut pas dismiss un forced
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(SNOOZE_STORAGE_KEY, String(Date.now() + 24 * 60 * 60 * 1000)); // 24h
    } catch { /* quota */ }
    updateState({ severity: 'none', message: '' });
  }, []);

  return { ...state, reload, snooze, dismiss };
}
