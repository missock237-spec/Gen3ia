'use client';

// ============================================================
// AdPreferencesPanel — Plan-aware advertising preferences.
// ------------------------------------------------------------
// * Free plan users: see a read-only explanation that ads are
//   mandatory and unrewarded, with a CTA to upgrade.
// * Paid plan users: can toggle ads (master switch) and rewards.
//   Disabling ads also blocks rewards (and disables the toggle).
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { Megaphone, Lock, Gift, ToggleLeft, ToggleRight, AlertCircle, RefreshCw, CheckCircle2 } from 'lucide-react';

interface AdPreferences {
  adsEnabled: boolean;
  rewardedAdsEnabled: boolean;
  totalCreditsEarned: number;
  totalAdsViewed: number;
  totalAdsClicked: number;
  isEligible: boolean;
  adType: 'unrewarded' | 'rewarded';
  mustShowInConversation: boolean;
  canDisableAds: boolean;
  isFreePlan: boolean;
  plan: string;
}

export function AdPreferencesPanel() {
  const [prefs, setPrefs] = useState<AdPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<'ads' | 'rewards' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ads?scope=preferences', { cache: 'no-store' });
      if (!res.ok) throw new Error('Échec du chargement');
      const data = await res.json();
      setPrefs(data?.preferences ?? null);
    } catch (err) {
      setError(String((err as Error).message || err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) try { await load(); } catch {}
    })();
    return () => { cancelled = true; };
  }, [load]);

  const setAdsEnabled = useCallback(
    async (enabled: boolean) => {
      if (!prefs || !prefs.canDisableAds) return;
      setSaving('ads');
      setError(null);
      setInfo(null);
      try {
        const res = await fetch('/api/ads?action=set-ads-enabled', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || 'Échec de la mise à jour');
        }
        setInfo(
          enabled
            ? 'Publicités réactivées. Les récompenses crédit sont à nouveau disponibles.'
            : 'Publicités désactivées. Les récompenses crédit sont également bloquées.'
        );
        await load();
      } catch (err) {
        setError(String((err as Error).message || err));
      } finally {
        setSaving(null);
      }
    },
    [prefs, load]
  );

  const setRewardedEnabled = useCallback(
    async (enabled: boolean) => {
      if (!prefs || !prefs.canDisableAds) return;
      setSaving('rewards');
      setError(null);
      setInfo(null);
      try {
        const res = await fetch('/api/ads?action=set-rewarded', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || 'Échec de la mise à jour');
        }
        setInfo(
          enabled
            ? 'Récompenses activées : vous gagnez des crédits pour chaque publicité affichée.'
            : 'Récompenses désactivées : les publicités restent affichées, sans crédit.'
        );
        await load();
      } catch (err) {
        setError(String((err as Error).message || err));
      } finally {
        setSaving(null);
      }
    },
    [prefs, load]
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Publicités & récompenses</h2>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Chargement…
        </div>
      </div>
    );
  }

  if (!prefs) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Publicités & récompenses</h2>
        </div>
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          <span>Impossible de charger vos préférences publicitaires.</span>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
        >
          <RefreshCw className="h-4 w-4" />
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Megaphone className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Publicités & récompenses</h2>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {info && (
        <div className="flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 mt-0.5" />
          <span>{info}</span>
        </div>
      )}

      {/* Free plan — read-only banner */}
      {prefs.isFreePlan && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <div className="flex items-start gap-2">
            <Lock className="h-4 w-4 mt-0.5 text-amber-600" />
            <div className="space-y-1">
              <p className="font-medium text-amber-700 dark:text-amber-400">
                Plan gratuit : publicités obligatoires
              </p>
              <p className="text-muted-foreground">
                Sur le plan gratuit, un lien sponsorisé est affiché après chaque réponse de l&apos;agent IA.
                Ces publicités ne sont pas récompensées et ne peuvent pas être désactivées. Passez à un plan
                payant pour cumuler des crédits et désactiver les publicités.
              </p>
              <a
                href="/dashboard/billing"
                className="inline-flex items-center gap-1 mt-2 text-sm font-medium text-primary hover:underline"
              >
                Voir les plans payants →
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Paid plan — controls */}
      {!prefs.isFreePlan && (
        <div className="space-y-4">
          <div className="rounded-md border border-border p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Megaphone className="h-4 w-4" />
                  <p className="font-medium">Afficher les publicités</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  Un lien sponsorisé est affiché après chaque réponse de l&apos;agent IA. Désactiver les
                  publicités bloque également les récompenses crédit.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={prefs.adsEnabled}
                disabled={saving === 'ads'}
                onClick={() => setAdsEnabled(!prefs.adsEnabled)}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-sm transition ${
                  prefs.adsEnabled
                    ? 'text-emerald-600 hover:bg-emerald-500/10'
                    : 'text-muted-foreground hover:bg-muted'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {prefs.adsEnabled ? (
                  <ToggleRight className="h-6 w-6" />
                ) : (
                  <ToggleLeft className="h-6 w-6" />
                )}
                <span>{prefs.adsEnabled ? 'Activées' : 'Désactivées'}</span>
              </button>
            </div>
          </div>

          <div
            className={`rounded-md border p-4 transition ${
              prefs.adsEnabled
                ? 'border-border'
                : 'border-border opacity-60'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Gift className="h-4 w-4" />
                  <p className="font-medium">Récompenses crédit</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  Cumulez des crédits Gen3ia pour chaque publicité affichée et cliquée. Les récompenses
                  nécessitent que les publicités soient activées.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={prefs.rewardedAdsEnabled}
                disabled={saving === 'rewards' || !prefs.adsEnabled}
                onClick={() => setRewardedEnabled(!prefs.rewardedAdsEnabled)}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-sm transition ${
                  prefs.rewardedAdsEnabled
                    ? 'text-emerald-600 hover:bg-emerald-500/10'
                    : 'text-muted-foreground hover:bg-muted'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {prefs.rewardedAdsEnabled ? (
                  <ToggleRight className="h-6 w-6" />
                ) : (
                  <ToggleLeft className="h-6 w-6" />
                )}
                <span>{prefs.rewardedAdsEnabled ? 'Activées' : 'Désactivées'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats (always visible) */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-md border border-border p-3 text-center">
          <p className="text-xs text-muted-foreground">Publicités vues</p>
          <p className="text-xl font-semibold mt-1">{prefs.totalAdsViewed}</p>
        </div>
        <div className="rounded-md border border-border p-3 text-center">
          <p className="text-xs text-muted-foreground">Publicités cliquées</p>
          <p className="text-xl font-semibold mt-1">{prefs.totalAdsClicked}</p>
        </div>
        <div className="rounded-md border border-border p-3 text-center">
          <p className="text-xs text-muted-foreground">Crédits gagnés</p>
          <p className="text-xl font-semibold mt-1">{prefs.totalCreditsEarned}</p>
        </div>
      </div>
    </div>
  );
}
