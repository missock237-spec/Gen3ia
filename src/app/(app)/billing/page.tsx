"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { renderRich } from "@/lib/i18n/rich";
import { usePolling, apiPost, formatCredits, useUser } from "@/lib/client/hooks";
import { StatusBadge } from "@/components/app/status-badge";
import { CreditCard, Coins, ArrowDownLeft, ArrowUpRight, Check, ExternalLink, AlertTriangle } from "lucide-react";

interface BillingData {
  ok: boolean
  balance: number
  plan: string
  offers: { key: string; name: string; price: number; currency: string; credits: number; features: string[] }[]
  chariow: { configured: boolean }
  transactions: { id: string; type: string; amount: number; balanceAfter: number; description: string; createdAt: string }[]
  payments: { id: string; plan: string | null; amount: number; currency: string; credits: number; status: string; createdAt: string }[]
}

export default function BillingPage() {
  const { toast } = useToast();
  const { t, lang } = useI18n();
  const { data, loading, reload } = usePolling<BillingData>("/api/billing");
  const { refresh } = useUser();
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  const locale = lang === "fr" ? "fr-FR" : "en-US";

  async function checkout(planKey: string) {
    setCheckoutLoading(planKey)
    try {
      const res = await apiPost<{ paymentUrl: string }>("/api/billing/checkout", { planKey })
      if (!res.ok) throw new Error(res.error)
      window.location.href = res.paymentUrl
    } catch (err) {
      toast({ title: t("billing.errors.checkout"), description: err instanceof Error ? err.message : "", variant: "destructive" })
    } finally {
      setCheckoutLoading(null)
    }
  }

  const transactions = data?.transactions ?? []
  const payments = data?.payments ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <CreditCard className="h-6 w-6 text-emerald-400" /> {t("billing.title")}
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          {t("billing.subtitle")}
        </p>
      </div>

      {/* Solde */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Card className="bg-zinc-900/40 border-zinc-800 sm:col-span-1">
          <CardContent className="pt-6">
            <div className="text-xs text-zinc-500 uppercase tracking-wide">{t("billing.balance")}</div>
            <div className="text-3xl font-bold text-emerald-400 mt-1">{formatCredits(data?.balance ?? 0)}</div>
            <div className="text-xs text-zinc-500 mt-1">{t("billing.balanceMeta", { plan: data?.plan ?? "FREE" })}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/40 border-zinc-800 sm:col-span-2">
          <CardContent className="pt-6">
            <div className="text-xs text-zinc-500 uppercase tracking-wide mb-2">{t("billing.recentChanges")}</div>
            <div className="space-y-1.5 max-h-24 overflow-y-auto">
              {transactions.slice(0, 3).map((tx) => (
                <div key={tx.id} className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400 truncate mr-3">{tx.description}</span>
                  <span className={`font-mono shrink-0 ${tx.amount < 0 ? "text-red-400" : "text-emerald-400"}`}>
                    {tx.amount > 0 ? "+" : ""}{formatCredits(tx.amount)}
                  </span>
                </div>
              ))}
              {transactions.length === 0 && <p className="text-xs text-zinc-600">{t("billing.noTransactions")}</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Statut Chariow */}
      {data && !data.chariow.configured && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="pt-6 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-amber-200">{t("billing.chariow.title")}</h3>
              <p className="text-xs text-amber-200/70 mt-1">
                {renderRich(t("billing.chariow.desc"))}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Offres */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
          <Coins className="h-4 w-4 text-emerald-400" /> {t("billing.offers.title")}
        </h2>
        {loading ? (
          <div className="grid sm:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-64 bg-zinc-800/60" />)}
          </div>
        ) : (
          <div className="grid sm:grid-cols-3 gap-4">
            {(data?.offers ?? []).map((offer) => (
              <Card key={offer.key} className="bg-zinc-900/40 border-zinc-800 flex flex-col">
                <CardContent className="p-5 flex-1 flex flex-col">
                  <h3 className="font-semibold">{offer.name}</h3>
                  <div className="mt-2 text-2xl font-bold">
                    {offer.price.toLocaleString("fr-FR")} <span className="text-sm font-normal text-zinc-500">{offer.currency}</span>
                  </div>
                  <div className="text-sm text-emerald-400 mt-0.5">{t("billing.creditsValue", { credits: offer.credits.toLocaleString("fr-FR") })}</div>
                  <ul className="mt-4 space-y-2 text-xs text-zinc-400 flex-1">
                    {offer.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    onClick={() => checkout(offer.key)}
                    disabled={checkoutLoading === offer.key || (data ? data.chariow.configured !== true : false)}
                    className="mt-5 w-full bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-semibold"
                  >
                    {checkoutLoading === offer.key ? t("billing.redirecting") : (
                      <>{t("billing.recharge")} <ExternalLink className="h-3.5 w-3.5 ml-1.5" /></>
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Paiements */}
      {payments.length > 0 && (
        <Card className="bg-zinc-900/40 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-base">{t("billing.payments", { count: payments.length })}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800/60 bg-zinc-950 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm text-zinc-200">{t("billing.pack", { plan: p.plan ?? "—" })}</p>
                    <p className="text-xs text-zinc-500">
                      {t("billing.paymentMeta", {
                        amount: p.amount.toLocaleString("fr-FR"),
                        currency: p.currency,
                        credits: p.credits,
                        date: new Date(p.createdAt).toLocaleString(locale),
                      })}
                    </p>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ledger */}
      <Card className="bg-zinc-900/40 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base">{t("billing.ledger.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 bg-zinc-800/60" />)}</div>
          ) : transactions.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-8">{t("billing.ledger.empty")}</p>
          ) : (
            <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
              {transactions.map((tx) => (
                <div key={tx.id} className="flex items-center gap-3 rounded-lg border border-zinc-800/60 bg-zinc-950 px-4 py-2.5">
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
                    tx.amount < 0 ? "border-red-500/20 bg-red-500/10 text-red-400" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                  }`}>
                    {tx.amount < 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownLeft className="h-3.5 w-3.5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-zinc-300 truncate">{tx.description}</p>
                    <p className="text-[11px] text-zinc-600 font-mono">
                      {t("billing.ledger.meta", {
                        type: tx.type,
                        date: new Date(tx.createdAt).toLocaleString(locale),
                        balance: formatCredits(tx.balanceAfter),
                      })}
                    </p>
                  </div>
                  <div className={`text-sm font-mono shrink-0 ${tx.amount < 0 ? "text-red-400" : "text-emerald-400"}`}>
                    {tx.amount > 0 ? "+" : ""}{formatCredits(tx.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
