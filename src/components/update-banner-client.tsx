'use client';

import { useEffect, useRef } from 'react';
import { UpdateBanner } from '@/components/update-banner';
import { initAutoUpdate } from '@/lib/auto-update';

/**
 * Wrapper client pour l'initialisation de l'auto-update.
 * Monté dans le layout racine, ce composant :
 * 1. Enregistre le service worker avec les listeners d'update
 * 2. Démarre le polling de /api/app-version
 * 3. Rend la bannière de mise à jour quand nécessaire
 *
 * Utilise useRef pour s'assurer que l'init ne se fait qu'une fois,
 * même en cas de re-render strict mode (React 19 development).
 */
export function UpdateBannerClient() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    initAutoUpdate();
  }, []);

  return <UpdateBanner />;
}
