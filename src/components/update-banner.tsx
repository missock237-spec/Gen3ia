// ============================================================
// UpdateBanner — Bannière de mise à jour non-intrusive
// ============================================================
// S'affiche quand une nouvelle version de l'application est
// disponible. Deux modes :
//   - Soft (updateAvailable) : bannière discrète en bas de l'écran
//     avec boutons "Mettre à jour", "Plus tard", et fermer.
//   - Forced (forceUpdate) : modal pleine page qui bloque
//     l'interaction jusqu'au rechargement.
//
// Utilise les composants shadcn/ui existants (Button, Badge).
// Intégré dans le layout racine, actif uniquement côté client.
// ============================================================

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAutoUpdate, type UpdateSeverity } from '@/lib/auto-update';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// --- Configuration visuelle ---

const BANNER_AUTO_DISMISS_MS = 30 * 1000; // La bannière soft se cache après 30s

// --- Composant principal ---

export function UpdateBanner() {
  const { severity, message, serverVersion, clientVersion, isReloading, reloadError, reload, snooze, dismiss } = useAutoUpdate();
  const [showSoft, setShowSoft] = useState(false);
  const [showForced, setShowForced] = useState(false);
  const [progress, setProgress] = useState(0);

  // Gérer les changements de sévérité
  useEffect(() => {
    if (severity === 'available') {
      setShowSoft(true);
      setShowForced(false);
    } else if (severity === 'forced') {
      setShowSoft(false);
      setShowForced(true);
    } else {
      setShowSoft(false);
      setShowForced(false);
    }
  }, [severity]);

  // Auto-dismiss de la bannière soft après BANNER_AUTO_DISMISS_MS
  useEffect(() => {
    if (!showSoft) return;
    const timer = setTimeout(() => {
      setShowSoft(false);
      snooze();
    }, BANNER_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [showSoft, snooze]);

  // Animation de progression pendant le rechargement
  useEffect(() => {
    if (!isReloading) {
      setProgress(0);
      return;
    }
    const interval = setInterval(() => {
      setProgress((p) => Math.min(p + Math.random() * 15, 95));
    }, 500);
    return () => clearInterval(interval);
  }, [isReloading]);

  const handleReload = useCallback(() => {
    reload();
  }, [reload]);

  const handleSnooze = useCallback(() => {
    setShowSoft(false);
    snooze();
  }, [snooze]);

  const handleDismiss = useCallback(() => {
    setShowSoft(false);
    dismiss();
  }, [dismiss]);

  // Ne rien rendre côté serveur
  if (typeof window === 'undefined') return null;
  if (severity === 'none' && !showSoft && !showForced) return null;

  return (
    <>
      {/* === Bannière soft (barre en bas de l'écran) === */}
      <SoftBanner
        visible={showSoft}
        serverVersion={serverVersion}
        clientVersion={clientVersion}
        message={message}
        isReloading={isReloading}
        reloadError={reloadError}
        progress={progress}
        onReload={handleReload}
        onSnooze={handleSnooze}
        onDismiss={handleDismiss}
      />

      {/* === Modal forced (bloquant) === */}
      <ForcedDialog
        open={showForced}
        serverVersion={serverVersion}
        clientVersion={clientVersion}
        message={message}
        isReloading={isReloading}
        reloadError={reloadError}
        progress={progress}
        onReload={handleReload}
      />
    </>
  );
}

// --- Bannière soft ---

interface SoftBannerProps {
  visible: boolean;
  serverVersion: string;
  clientVersion: string;
  message: string;
  isReloading: boolean;
  reloadError: boolean;
  progress: number;
  onReload: () => void;
  onSnooze: () => void;
  onDismiss: () => void;
}

function SoftBanner({
  visible, serverVersion, clientVersion, message, isReloading, reloadError, progress,
  onReload, onSnooze, onDismiss,
}: SoftBannerProps) {
  if (!visible && !isReloading) return null;

  return (
    <div
      className={
        'fixed bottom-0 left-0 right-0 z-[9999] border-t transition-all duration-300 ' +
        (visible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none')
      }
      role="alert"
      aria-live="polite"
    >
      {/* Barre de progression pendant le rechargement */}
      {isReloading && (
        <div className="h-0.5 bg-muted overflow-hidden">
          <div
            className="h-full bg-violet-500 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="bg-background/95 backdrop-blur-sm border-border px-4 py-3">
        <div className="mx-auto max-w-5xl flex items-center justify-between gap-4">
          {/* Contenu */}
          <div className="flex items-center gap-3 min-w-0">
            {!isReloading && !reloadError && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-violet-500/10 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-violet-500">
                  <path d="M8 1v7m0 0l-3-3m3 3l3-3M2 11v2a2 2 0 002 2h8a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            )}
            {isReloading && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-violet-500/10 flex items-center justify-center">
                <svg className="animate-spin text-violet-500" width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="50 20" strokeLinecap="round"/>
                </svg>
              </div>
            )}
            {reloadError && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-amber-500">
                  <path d="M8 1a7 7 0 100 14A7 7 0 008 1zM8 11V8m0-3h.007" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {isReloading
                  ? 'Mise à jour en cours...'
                  : reloadError
                  ? 'La mise à jour a échoué. Nouvelle tentative dans quelques instants.'
                  : message || 'Une nouvelle version est disponible.'}
              </p>
              {!isReloading && !reloadError && (
                <p className="text-xs text-muted-foreground">
                  {clientVersion && serverVersion
                    ? `${clientVersion} → ${serverVersion}`
                    : 'Cliquez pour mettre à jour'}
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {reloadError && (
              <Button size="sm" variant="outline" onClick={onReload}>
                Réessayer
              </Button>
            )}
            {!isReloading && !reloadError && (
              <>
                <Button size="sm" onClick={onSnooze} variant="ghost" className="hidden sm:inline-flex">
                  Plus tard
                </Button>
                <Button size="sm" onClick={onReload} className="gap-1.5">
                  Mettre à jour
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {serverVersion}
                  </Badge>
                </Button>
              </>
            )}
            {!isReloading && !reloadError && (
              <button
                onClick={onDismiss}
                className="flex-shrink-0 p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Fermer"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Modal forced ---

interface ForcedDialogProps {
  open: boolean;
  serverVersion: string;
  clientVersion: string;
  message: string;
  isReloading: boolean;
  reloadError: boolean;
  progress: number;
  onReload: () => void;
}

function ForcedDialog({ open, serverVersion, clientVersion, message, isReloading, reloadError, progress, onReload }: ForcedDialogProps) {
  return (
    <Dialog open={open} onOpenChange={() => { /* non fermable */ }}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="mx-auto mb-2 w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-amber-500">
              <path d="M12 9v4m0 4h.01M5.07 19H18.93a2 2 0 001.985-1.75l1.7-10.5A2 2 0 0021.73 4H2.27a2 2 0 00-1.985 2.25l1.7 10.5A2 2 0 005.07 19z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <DialogTitle className="text-center">Mise à jour requise</DialogTitle>
          <DialogDescription className="text-center">
            {message || `Votre version (${clientVersion}) n'est plus supportée. Veuillez mettre à jour vers la version ${serverVersion}.`}
          </DialogDescription>
        </DialogHeader>

        {/* Barre de progression */}
        {isReloading && (
          <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {reloadError && (
          <p className="text-sm text-destructive text-center mt-2">
            La mise à jour a échoué. Vérifiez votre connexion et réessayez.
          </p>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={onReload}
            disabled={isReloading}
            className="w-full gap-2"
          >
            {isReloading ? (
              <>
                <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="50 20" strokeLinecap="round"/>
                </svg>
                Mise à jour en cours...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 1v7m0 0l-3-3m3 3l3-3M2 11v2a2 2 0 002 2h8a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Mettre à jour maintenant
              </>
            )}
          </Button>
          {reloadError && (
            <p className="text-xs text-muted-foreground text-center">
              Une nouvelle tentative sera effectuée automatiquement dans quelques minutes.
            </p>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
