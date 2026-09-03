"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { apiPost, apiPatch, apiDelete } from "@/lib/client/hooks";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import {
  Megaphone, Wallet, Coins, Link2, CheckCircle2, Plus, Trash2, PlayCircle,
  PauseCircle, CheckCircle, Loader2, Globe,
} from "lucide-react";

/**
 * Page Publicités — annonces des utilisateurs, facturation publicitaire
 * dédiée (portefeuille FCFA + recharges Chariow), campagnes avec budgets
 * journaliers débités du solde, et comptes publicitaires liés (Google Ads,
 * Meta Ads, TikTok Ads, LinkedIn Ads) via le flux OAuth des connecteurs.
 */

interface AdAccountView {
  slug: string
  connected: boolean
  status: string | null
  accountHint: string | null
  lastError: string | null
}

interface CreativeView {
  id: string
  headline: string
  body: string
  cta: string | null
  mediaUrl: string | null
  status: string
  createdAt: string
}

interface CampaignView {
  id: string
  name: string
  platform: string
  objective: string
  status: string
  budgetPerDay: number
  totalSpent: number
  targetUrl: string | null
  startDate: string | null
  endDate: string | null
  createdAt: string
  creatives: CreativeView[]
}

interface AdsData {
  ok: boolean
  balance: number
  transactions: { id: string; type: string; amount: number; balanceAfter: number; description: string; createdAt: string }[]
  campaigns: CampaignView[]
  accounts: AdAccountView[]
}

const PLATFORM_KEYS: Record<string, TranslationKey> = {
  googleads: "ads.accounts.googleads",
  metaads: "ads.accounts.metaads",
  tiktok: "ads.accounts.tiktok",
  linkedin_ads: "ads.accounts.linkedin_ads",
};

const CAMPAIGN_STATUS_CLS: Record<string, string> = {
  DRAFT: "border-zinc-700 text-zinc-400",
  ACTIVE: "border-emerald-700/50 text-emerald-300",
  PAUSED: "border-orange-700/50 text-orange-300",
  COMPLETED: "border-blue-700/50 text-blue-300",
};

export default function AdsPage() {
  const { toast } = useToast();
  const { t, lang } = useI18n();
  const [data, setData] = useState<AdsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  // Recharge du portefeuille.
  const [rechargeAmount, setRechargeAmount] = useState("5000");
  const [recharging, setRecharging] = useState(false);

  // Formulaire de campagne.
  const [showCreate, setShowCreate] = useState(false);
  const [cName, setCName] = useState("");
  const [cPlatform, setCPlatform] = useState("googleads");
  const [cObjective, setCObjective] = useState("TRAFFIC");
  const [cBudget, setCBudget] = useState("2000");
  const [cTargetUrl, setCTargetUrl] = useState("");
  const [creating, setCreating] = useState(false);

  // Formulaire de création (créa).
  const [creativeCampaign, setCreativeCampaign] = useState<CampaignView | null>(null);
  const [crHeadline, setCrHeadline] = useState("");
  const [crBody, setCrBody] = useState("");
  const [crCta, setCrCta] = useState("");
  const [crMediaUrl, setCrMediaUrl] = useState("");
  const [addingCreative, setAddingCreative] = useState(false);

  const locale = lang === "fr" ? "fr-FR" : "en-US";
  const fmt = (n: number) => n.toLocaleString(locale);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/ads", { cache: "no-store" });
      const json = (await res.json()) as AdsData;
      if (json.ok) setData(json);
    } catch {
      toast({ title: t("ads.errors.load"), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Retour de paiement (?payment=pending).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") === "pending") {
      toast({ title: t("ads.wallet.recharging") });
      window.history.replaceState({}, "", "/ads");
    }
  }, [toast, t]);

  async function recharge() {
    const amount = Number(rechargeAmount);
    if (!Number.isFinite(amount) || amount < 1000) {
      toast({ title: t("ads.wallet.invalid"), description: t("ads.wallet.tooLow", { min: 1000 }), variant: "destructive" });
      return;
    }
    setRecharging(true);
    try {
      const res = await apiPost<{ paymentUrl: string }>("/api/ads/recharge", { amount: Math.round(amount) });
      if (!res.ok) throw new Error(res.error);
      toast({ title: t("ads.wallet.recharged", { amount: fmt(Math.round(amount)) }) });
      window.location.href = res.paymentUrl;
    } catch (err) {
      toast({ title: t("ads.errors.title"), description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setRecharging(false);
    }
  }

  async function connectAccount(slug: string) {
    setBusy(slug);
    try {
      // Flux OAuth standard des connecteurs : POST → URL d'autorisation.
      const res = await apiPost<{ redirectUrl: string; mode: string }>("/api/connectors/connect", {
        appSlug: slug,
        redirectUri: `${window.location.origin}/ads?callback=${slug}`,
      });
      if (res.ok && res.redirectUrl) {
        window.location.href = res.redirectUrl;
        return;
      }
      toast({
        title: t("ads.errors.title"),
        description: res.error ?? t("ads.accounts.pending"),
        variant: "destructive",
      });
    } catch (err) {
      toast({ title: t("ads.errors.title"), description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function createCampaign() {
    if (!cName.trim()) return;
    setCreating(true);
    try {
      const res = await apiPost<{ campaign: CampaignView }>("/api/ads", {
        name: cName.trim(),
        platform: cPlatform,
        objective: cObjective,
        budgetPerDay: Number(cBudget) || 0,
        targetUrl: cTargetUrl.trim() || null,
      });
      if (!res.ok) throw new Error(res.error);
      toast({ title: t("ads.campaigns.created"), description: t("ads.campaigns.createdDesc") });
      setCName("");
      setCBudget("2000");
      setCTargetUrl("");
      setShowCreate(false);
      await refresh();
    } catch (err) {
      toast({ title: t("ads.errors.create"), description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  async function updateCampaign(campaign: CampaignView, status: string) {
    setBusy(campaign.id);
    try {
      const res = await apiPatch<{ campaign: CampaignView }>(`/api/ads/campaigns/${campaign.id}`, { status });
      if (!res.ok) throw new Error(res.error);
      if (status === "ACTIVE") {
        toast({
          title: t("ads.campaigns.activated"),
          description: t("ads.campaigns.activatedDesc", { amount: fmt(campaign.budgetPerDay) }),
        });
      } else if (status === "PAUSED") {
        toast({ title: t("ads.campaigns.paused"), description: t("ads.campaigns.pausedDesc") });
      } else {
        toast({ title: t("ads.campaigns.complete") });
      }
      await refresh();
    } catch (err) {
      toast({ title: t("ads.errors.update"), description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function deleteCampaign(campaign: CampaignView) {
    setBusy(campaign.id);
    try {
      const res = await apiDelete(`/api/ads/campaigns/${campaign.id}`);
      if (!res.ok) throw new Error(res.error);
      toast({ title: t("ads.campaigns.deleted") });
      await refresh();
    } catch (err) {
      toast({ title: t("ads.errors.update"), description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function addCreative() {
    if (!creativeCampaign || !crHeadline.trim() || !crBody.trim()) return;
    setAddingCreative(true);
    try {
      const res = await apiPost<{ creative: CreativeView }>("/api/ads/creatives", {
        campaignId: creativeCampaign.id,
        headline: crHeadline.trim(),
        body: crBody.trim(),
        cta: crCta.trim() || null,
        mediaUrl: crMediaUrl.trim() || null,
      });
      if (!res.ok) throw new Error(res.error);
      toast({ title: t("ads.creatives.added") });
      setCrHeadline("");
      setCrBody("");
      setCrCta("");
      setCrMediaUrl("");
      await refresh();
    } catch (err) {
      toast({ title: t("ads.errors.create"), description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setAddingCreative(false);
    }
  }

  async function deleteCreative(creativeId: string) {
    try {
      const res = await apiDelete(`/api/ads/creatives/${creativeId}`);
      if (!res.ok) throw new Error(res.error);
      toast({ title: t("ads.creatives.deleted") });
      await refresh();
    } catch (err) {
      toast({ title: t("ads.errors.update"), description: err instanceof Error ? err.message : "", variant: "destructive" });
    }
  }

  const campaigns = data?.campaigns ?? [];
  const accounts = data?.accounts ?? [];
  const transactions = data?.transactions ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Megaphone className="h-6 w-6 text-emerald-400" /> {t("ads.title")}
        </h1>
        <p className="text-sm text-zinc-400 mt-1">{t("ads.subtitle")}</p>
      </div>

      {/* Portefeuille publicitaire */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="bg-zinc-900/40 border-zinc-800">
          <CardContent className="pt-6">
            <div className="text-xs text-zinc-500 uppercase tracking-wide flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5" /> {t("ads.wallet.balance")}
            </div>
            <div className="text-3xl font-bold text-emerald-400 mt-1">
              {fmt(data?.balance ?? 0)} <span className="text-sm font-normal text-zinc-500">{t("ads.wallet.fcfa")}</span>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/40 border-zinc-800 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Coins className="h-4 w-4 text-emerald-400" /> {t("ads.wallet.rechargeTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-zinc-500 mb-3">{t("ads.wallet.rechargeDesc", { min: 1000 })}</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="ads-recharge" className="text-xs">{t("ads.wallet.amount")}</Label>
                <Input
                  id="ads-recharge"
                  type="number"
                  min={1000}
                  step={500}
                  value={rechargeAmount}
                  onChange={(e) => setRechargeAmount(e.target.value)}
                  className="bg-zinc-950 border-zinc-800"
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={() => void recharge()}
                  disabled={recharging}
                  className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-semibold"
                >
                  {recharging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4 mr-1.5" />}
                  {t("ads.wallet.recharge")}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Comptes publicitaires (OAuth 1-clic) */}
      <Card className="bg-zinc-900/40 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4 text-emerald-400" /> {t("ads.accounts.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-zinc-500 mb-4">{t("ads.accounts.desc")}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {loading
              ? [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)
              : accounts.map((acc) => {
                  const key = PLATFORM_KEYS[acc.slug];
                  return (
                    <div
                      key={acc.slug}
                      className={`rounded-xl border p-4 ${acc.connected ? "border-emerald-700/50 bg-emerald-950/20" : "border-zinc-800 bg-zinc-950"}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-zinc-100">{t(key)}</span>
                        {acc.connected && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                      </div>
                      {acc.connected ? (
                        <p className="mt-2 text-[11px] text-emerald-300/80">
                          {t("ads.accounts.connected")}
                          {acc.accountHint ? ` · ${acc.accountHint}` : ""}
                        </p>
                      ) : (
                        <p className="mt-2 text-[11px] text-zinc-500">{t("ads.accounts.pending")}</p>
                      )}
                      <Button
                        size="sm"
                        className="mt-3 w-full h-8 text-xs"
                        variant={acc.connected ? "outline" : "default"}
                        disabled={busy === acc.slug}
                        onClick={() => connectAccount(acc.slug)}
                      >
                        {acc.connected ? <Link2 className="h-3.5 w-3.5 mr-1.5" /> : <Link2 className="h-3.5 w-3.5 mr-1.5" />}
                        {t("ads.accounts.connect")}
                      </Button>
                    </div>
                  );
                })}
          </div>
        </CardContent>
      </Card>

      {/* Campagnes */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
          <Megaphone className="h-4 w-4" /> {t("ads.campaigns.title")} ({campaigns.length})
        </h2>
        <Button size="sm" onClick={() => setShowCreate(!showCreate)} className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
          <Plus className="h-4 w-4 mr-1.5" /> {t("ads.campaigns.create")}
        </Button>
      </div>

      {showCreate && (
        <Card className="bg-zinc-900/40 border-zinc-800">
          <CardContent className="p-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("ads.campaigns.name")}</Label>
                <Input value={cName} onChange={(e) => setCName(e.target.value)} placeholder={t("ads.campaigns.namePlaceholder")} className="bg-zinc-950 border-zinc-800" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("ads.campaigns.platform")}</Label>
                <select
                  value={cPlatform}
                  onChange={(e) => setCPlatform(e.target.value)}
                  className="w-full h-9 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-200"
                >
                  {Object.entries(PLATFORM_KEYS).map(([slug, key]) => (
                    <option key={slug} value={slug}>{t(key)}</option>
                  ))}
                  <option value="other">{t("ads.campaigns.other")}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("ads.campaigns.objective")}</Label>
                <select
                  value={cObjective}
                  onChange={(e) => setCObjective(e.target.value)}
                  className="w-full h-9 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-200"
                >
                  {["AWARENESS", "TRAFFIC", "CONVERSION", "LEADS"].map((o) => (
                    <option key={o} value={o}>{t(`ads.campaigns.objectives.${o}` as TranslationKey)}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("ads.campaigns.budget")}</Label>
                <Input type="number" min={0} step={500} value={cBudget} onChange={(e) => setCBudget(e.target.value)} className="bg-zinc-950 border-zinc-800" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">{t("ads.campaigns.targetUrl")}</Label>
                <Input value={cTargetUrl} onChange={(e) => setCTargetUrl(e.target.value)} placeholder="https://…" className="bg-zinc-950 border-zinc-800" />
              </div>
            </div>
            <Button onClick={() => void createCampaign()} disabled={creating || !cName.trim()} className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-semibold">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
              {t("ads.campaigns.submit")}
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-3">{[1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-sm text-zinc-400">
          {t("ads.campaigns.empty")}
        </div>
      ) : (
        <div className="space-y-4">
          {campaigns.map((c) => (
            <Card key={c.id} className="bg-zinc-900/40 border-zinc-800">
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-zinc-100">{c.name}</h3>
                      <Badge variant="outline" className={CAMPAIGN_STATUS_CLS[c.status] ?? CAMPAIGN_STATUS_CLS.DRAFT}>
                        {t(`ads.campaigns.statuses.${c.status}` as TranslationKey)}
                      </Badge>
                      <Badge variant="outline" className="border-zinc-700 text-zinc-400">
                        {PLATFORM_KEYS[c.platform] ? t(PLATFORM_KEYS[c.platform]) : c.platform}
                      </Badge>
                      <Badge variant="outline" className="border-zinc-700 text-zinc-400">
                        {t(`ads.campaigns.objectives.${c.objective}` as TranslationKey)}
                      </Badge>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1.5 flex flex-wrap gap-x-4">
                      <span>{t("ads.campaigns.budgetPerDay", { budget: fmt(c.budgetPerDay) })}</span>
                      <span className="text-emerald-400">{t("ads.campaigns.spent", { spent: fmt(c.totalSpent) })}</span>
                      {c.targetUrl && (
                        <span className="flex items-center gap-1">
                          <Globe className="h-3 w-3" /> {t("ads.campaigns.target", { url: c.targetUrl })}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {c.status !== "ACTIVE" && c.status !== "COMPLETED" && (
                      <Button
                        size="sm"
                        disabled={busy === c.id || c.budgetPerDay <= 0}
                        title={c.budgetPerDay <= 0 ? t("ads.campaigns.noBudget") : undefined}
                        onClick={() => void updateCampaign(c, "ACTIVE")}
                        className="h-8 text-xs bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
                      >
                        {busy === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5 mr-1.5" />}
                        {c.status === "PAUSED" ? t("ads.campaigns.resume") : t("ads.campaigns.activate")}
                      </Button>
                    )}
                    {c.status === "ACTIVE" && (
                      <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => void updateCampaign(c, "PAUSED")} className="h-8 text-xs border-zinc-700">
                        <PauseCircle className="h-3.5 w-3.5 mr-1.5" /> {t("ads.campaigns.pause")}
                      </Button>
                    )}
                    {c.status !== "COMPLETED" && c.status !== "DRAFT" && (
                      <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => void updateCampaign(c, "COMPLETED")} className="h-8 text-xs border-zinc-700">
                        <CheckCircle className="h-3.5 w-3.5 mr-1.5" /> {t("ads.campaigns.complete")}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" disabled={busy === c.id} onClick={() => void deleteCampaign(c)} className="h-8 text-xs text-red-300 hover:text-red-200">
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" /> {t("ads.campaigns.delete")}
                    </Button>
                  </div>
                </div>

                {/* Créations de la campagne */}
                <div className="mt-4 border-t border-zinc-800/60 pt-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h4 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                      {t("ads.creatives.title")} ({c.creatives.length})
                    </h4>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-emerald-400 hover:text-emerald-300"
                      onClick={() => {
                        setCreativeCampaign(creativeCampaign?.id === c.id ? null : c);
                        setCrHeadline("");
                        setCrBody("");
                        setCrCta("");
                        setCrMediaUrl("");
                      }}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> {t("ads.creatives.add")}
                    </Button>
                  </div>

                  {creativeCampaign?.id === c.id && (
                    <div className="mb-4 grid gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t("ads.creatives.headline")}</Label>
                        <Input value={crHeadline} onChange={(e) => setCrHeadline(e.target.value)} className="bg-zinc-950 border-zinc-800 h-8 text-xs" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t("ads.creatives.cta")}</Label>
                        <Input value={crCta} onChange={(e) => setCrCta(e.target.value)} placeholder="En savoir plus" className="bg-zinc-950 border-zinc-800 h-8 text-xs" />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label className="text-xs">{t("ads.creatives.body")}</Label>
                        <Input value={crBody} onChange={(e) => setCrBody(e.target.value)} className="bg-zinc-950 border-zinc-800 h-8 text-xs" />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label className="text-xs">{t("ads.creatives.mediaUrl")}</Label>
                        <Input value={crMediaUrl} onChange={(e) => setCrMediaUrl(e.target.value)} placeholder="https://…" className="bg-zinc-950 border-zinc-800 h-8 text-xs" />
                      </div>
                      <Button
                        onClick={() => void addCreative()}
                        disabled={addingCreative || !crHeadline.trim() || !crBody.trim()}
                        className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400 h-8 text-xs"
                      >
                        {addingCreative ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                        {t("ads.creatives.add")}
                      </Button>
                    </div>
                  )}

                  {c.creatives.length === 0 ? (
                    <p className="text-xs text-zinc-600">{t("ads.creatives.empty")}</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {c.creatives.map((cr) => (
                        <div key={cr.id} className="rounded-lg border border-zinc-800/60 bg-zinc-950 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-semibold text-zinc-200">{cr.headline}</p>
                            <button
                              onClick={() => void deleteCreative(cr.id)}
                              className="text-zinc-600 hover:text-red-400 shrink-0"
                              aria-label={t("ads.creatives.delete")}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <p className="mt-1 text-[11px] text-zinc-500 line-clamp-3">{cr.body}</p>
                          <div className="mt-2 flex items-center gap-2">
                            {cr.cta && <Badge variant="outline" className="border-emerald-800/60 text-emerald-300 text-[10px]">{cr.cta}</Badge>}
                            <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[10px]">
                              {t(`ads.creatives.statuses.${cr.status}` as TranslationKey)}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Historique du portefeuille */}
      <Card className="bg-zinc-900/40 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4 text-emerald-400" /> {t("ads.wallet.transactions")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-8">{t("ads.wallet.empty")}</p>
          ) : (
            <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
              {transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800/60 bg-zinc-950 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-xs text-zinc-300 truncate">{tx.description}</p>
                    <p className="text-[11px] text-zinc-600 font-mono">
                      {t("ads.wallet.meta", {
                        type: tx.type,
                        date: new Date(tx.createdAt).toLocaleString(locale),
                        balance: fmt(tx.balanceAfter),
                      })}
                    </p>
                  </div>
                  <div className={`text-sm font-mono shrink-0 ${tx.amount < 0 ? "text-red-400" : "text-emerald-400"}`}>
                    {tx.amount > 0 ? "+" : ""}{fmt(tx.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
