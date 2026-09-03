"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { usePolling, apiPost, apiDelete, formatCredits } from "@/lib/client/hooks";
import { RefreshCw, CalendarCheck, XCircle, Sparkles, Crown } from "lucide-react";

/**
 * Section abonnements SaaS (v3.6 — business) : plans mensuels/annuels,
 * crédits inclus, quotas différenciés, processeur Chariow OU Stripe.
 * Annulation à l'échéance (les crédits restent jusqu'à la fin de période).
 */

interface SubscriptionData {
  ok: boolean
  active: {
    id: string
    planKey: string
    planName: string
    interval: "monthly" | "yearly"
    status: string
    price: number
    currency: string
    creditsPerPeriod: number
    currentPeriodEnd: string
    cancelAtPeriodEnd: boolean
  } | null
  history: Array<{
    id: string
    planKey: string
    interval: string
    status: string
    price: number
    currentPeriodEnd: string
    createdAt: string
  }>
  plans: Array<{
    key: string
    name: string
    creditsPerPeriod: number
    monthlyPrice: number
    yearlyPrice: number
    currency: string
    maxAgents: number
    features: string[]
  }>
  processors: { chariow: boolean; stripe: boolean }
}

export function SubscriptionSection() {
  const { toast } = useToast();
  const { t, lang } = useI18n();
  const { data, loading, reload } = usePolling<SubscriptionData>("/api/billing/subscription", 30000);
  const [interval, setIntervalChoice] = useState<"monthly" | "yearly">("monthly");
  const [method, setMethod] = useState<"chariow" | "stripe">("chariow");
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const locale = lang === "fr" ? "fr-FR" : "en-US";
  const activeProcessor = data?.processors.chariow ? "chariow" : data?.processors.stripe ? "stripe" : null;

  async function subscribe(planKey: string) {
    setSubscribing(planKey);
    try {
      const res = await apiPost<{ paymentUrl: string }>("/api/billing/subscription", {
        planKey,
        interval,
        method: activeProcessor === "stripe" ? "stripe" : method,
      });
      if (!res.ok) throw new Error(res.error);
      toast({ title: t("billing.sub.redirecting"), description: t("billing.sub.redirectingDesc") });
      window.location.href = res.paymentUrl;
    } catch (err) {
      toast({
        title: t("billing.errors.checkout"),
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      });
    } finally {
      setSubscribing(null);
    }
  }

  async function cancel() {
    setCancelling(true);
    try {
      const res = await apiDelete("/api/billing/subscription");
      if (!res.ok) throw new Error(res.error);
      toast({ title: t("billing.sub.cancelled.title"), description: t("billing.sub.cancelled.desc") });
      await reload();
    } catch (err) {
      toast({
        title: t("billing.sub.cancelFailed"),
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      });
    } finally {
      setCancelling(false);
    }
  }

  const fmt = (amount: number) => `${amount.toLocaleString(locale)} FCFA`;

  return (
    <Card className="bg-zinc-900/40 border-zinc-800">
      <CardHeader className="pb-3 border-b border-zinc-800/60">
        <CardTitle className="text-base flex items-center gap-2">
          <Crown className="h-4 w-4 text-amber-400" />
          {t("billing.sub.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {/* Abonnement actif */}
        {data?.active ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <CalendarCheck className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-semibold text-emerald-200">
                  {data.active.planName} · {data.active.interval === "monthly" ? t("billing.sub.monthly") : t("billing.sub.yearly")}
                </span>
              </div>
              {data.active.cancelAtPeriodEnd ? (
                <Badge variant="outline" className="border-amber-500/40 text-amber-300 text-[10px]">
                  {t("billing.sub.endsOn")}
                </Badge>
              ) : (
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 text-[10px]">
                  {t("billing.sub.active")}
                </Badge>
              )}
            </div>
            <p className="text-xs text-zinc-400">
              {t("billing.sub.until", { date: new Date(data.active.currentPeriodEnd).toLocaleDateString(locale) })}
              {" · "}
              {t("billing.sub.creditsPerPeriod", { credits: data.active.creditsPerPeriod })}
              {" · "}
              {t("billing.sub.quota", { agents: data.plans.find((p) => p.key === data.active?.planKey)?.maxAgents ?? "?" })}
            </p>
            {!data.active.cancelAtPeriodEnd && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void cancel()}
                disabled={cancelling}
                className="h-7 text-xs border-amber-600/40 text-amber-300 hover:bg-amber-500/10"
              >
                {cancelling ? <RefreshCw className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3 mr-1" />}
                {t("billing.sub.cancel")}
              </Button>
            )}
          </div>
        ) : (
          <p className="text-xs text-zinc-500">{t("billing.sub.none")}</p>
        )}

        {/* Sélecteur période + processeur */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-950 p-0.5">
            {(["monthly", "yearly"] as const).map((iv) => (
              <button
                key={iv}
                type="button"
                onClick={() => setIntervalChoice(iv)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  interval === iv ? "bg-emerald-500 text-zinc-950 font-semibold" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {iv === "monthly" ? t("billing.sub.monthly") : t("billing.sub.yearly")}
                {iv === "yearly" && <span className="ml-1 opacity-80">(-17 %)</span>}
              </button>
            ))}
          </div>
          {data && data.processors.chariow && data.processors.stripe && (
            <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-950 p-0.5">
              {(["chariow", "stripe"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors font-mono uppercase ${
                    (activeProcessor ?? method) === m ? "bg-zinc-700 text-zinc-100 font-semibold" : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Plans */}
        <div className="grid sm:grid-cols-3 gap-3">
          {loading && !data
            ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-52 bg-zinc-900/40" />)
            : (data?.plans ?? []).map((plan) => {
                const price = interval === "monthly" ? plan.monthlyPrice : plan.yearlyPrice;
                const isCurrent = data?.active?.planKey === plan.key;
                return (
                  <div
                    key={plan.key}
                    className={`rounded-xl border p-4 space-y-3 ${
                      isCurrent ? "border-emerald-500/40 bg-emerald-500/5" : "border-zinc-800 bg-zinc-950/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm">{plan.name}</span>
                      {plan.key === "pro" && (
                        <Badge variant="outline" className="border-amber-500/40 text-amber-300 text-[10px]">
                          <Sparkles className="h-3 w-3 mr-1" />
                          {t("billing.sub.popular")}
                        </Badge>
                      )}
                    </div>
                    <div>
                      <span className="text-2xl font-bold text-emerald-400 font-mono">{fmt(price)}</span>
                      <span className="text-xs text-zinc-500">
                        {" / "}{interval === "monthly" ? t("billing.sub.perMonth") : t("billing.sub.perYear")}
                      </span>
                    </div>
                    <ul className="space-y-1 text-[11px] text-zinc-400">
                      <li className="text-emerald-300/90 font-medium">
                        {formatCredits(plan.creditsPerPeriod)} {t("billing.sub.creditsIncluded")}
                      </li>
                      <li>{t("billing.sub.agentsQuota", { count: plan.maxAgents })}</li>
                      {plan.features.slice(0, 3).map((f) => (
                        <li key={f}>· {f}</li>
                      ))}
                    </ul>
                    <Button
                      size="sm"
                      onClick={() => void subscribe(plan.key)}
                      disabled={subscribing === plan.key || !activeProcessor}
                      className={`w-full h-8 text-xs font-semibold ${
                        isCurrent
                          ? "bg-zinc-800 text-zinc-300"
                          : "bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
                      }`}
                    >
                      {subscribing === plan.key ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : isCurrent ? (
                        t("billing.sub.renew")
                      ) : (
                        t("billing.sub.subscribe")
                      )}
                    </Button>
                  </div>
                );
              })}
        </div>
        {data && !activeProcessor && (
          <p className="text-[11px] text-amber-300/80">{t("billing.sub.noProcessor")}</p>
        )}
        {data && data.processors.stripe && data.processors.chariow && (
          <p className="text-[10px] text-zinc-600">{t("billing.sub.twoProcessors")}</p>
        )}
      </CardContent>
    </Card>
  );
}
