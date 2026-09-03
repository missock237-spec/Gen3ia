"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePolling, apiPost, useUser } from "@/lib/client/hooks";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Store, Download, Star, Rocket , Coins } from "lucide-react";

interface MarketAgent {
  id: string
  name: string
  slug: string
  description: string | null
  category: string | null
  stats: { runs: number; success: number } | null
  createdAt: string
  rating: { avg: number | null; count: number } | null
  /** v3.6 — mise en vente : prix en crédits + identifiant de listing. */
  listing: { id: string; price: number; purchases: number } | null
}

export default function MarketplacePage() {
  const { toast } = useToast();
  const { t, lang } = useI18n();
  const router = useRouter();
  const { user } = useUser();

  const locale = lang === "fr" ? "fr-FR" : "en-US";
  const { data, loading, reload } = usePolling<{ ok: boolean; agents: MarketAgent[] }>("/api/marketplace");
  const [installing, setInstalling] = useState<string | null>(null);
  const [buying, setBuying] = useState<string | null>(null);

  async function install(agentId: string) {
    setInstalling(agentId)
    const res = await fetch("/api/marketplace", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ installAgentId: agentId }),
    })
    const data = await res.json()
    setInstalling(null)
    if (!data.ok) {
      toast({ title: t("marketplace.errors.install"), description: data.error, variant: "destructive" })
      return
    }
    toast({ title: t("marketplace.installed.title"), description: t("marketplace.installed.desc") })
    router.push("/agents")
  }

  /** v3.6 — achat RÉEL : débit de crédits, payout vendeur (80 %), commission 20 %. */
  async function buy(agent: MarketAgent) {
    if (!agent.listing) return
    setBuying(agent.id)
    try {
      const res = await fetch(`/api/marketplace/${agent.listing.id}/purchase`, { method: "POST" })
      const data = await res.json()
      if (!data.ok) {
        toast({ title: t("marketplace.buyFailed"), description: data.error, variant: "destructive" })
        return
      }
      toast({
        title: t("marketplace.purchased.title"),
        description: t("marketplace.purchased.desc", { credits: agent.listing.price }),
      })
      await reload()
      router.push("/agents")
    } finally {
      setBuying(null)
    }
  }

  const agents = data?.agents ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Store className="h-6 w-6 text-emerald-400" /> {t("marketplace.title")}
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          {t("marketplace.subtitle")}
        </p>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 bg-zinc-800/60" />)}
        </div>
      ) : agents.length === 0 ? (
        <Card className="border-zinc-800 bg-zinc-900/40">
          <CardContent className="py-16 text-center text-zinc-500">
            <Store className="h-12 w-12 mx-auto mb-4 text-zinc-700" />
            <h3 className="font-semibold text-zinc-200">{t("marketplace.empty.title")}</h3>
            <p className="text-sm mt-1 max-w-md mx-auto">
              {t("marketplace.empty.desc")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((a) => (
            <Card key={a.id} className="bg-zinc-900/40 border-zinc-800 hover:border-emerald-500/40 transition-colors flex flex-col">
              <CardContent className="p-5 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <Rocket className="h-5 w-5 text-emerald-400" />
                  </div>
                  {a.rating && a.rating.count > 0 && (
                    <div className="flex items-center gap-1 text-xs text-zinc-400">
                      <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                      {(a.rating.avg ?? 0).toFixed(1)} ({a.rating.count})
                    </div>
                  )}
                </div>
                <h3 className="font-semibold mt-3 text-zinc-100">{a.name}</h3>
                <p className="text-xs text-zinc-500 font-mono mt-0.5">/{a.slug}</p>
                <p className="text-sm text-zinc-400 mt-2 line-clamp-3 flex-1">
                  {a.description ?? t("agents.noDescription")}
                </p>
                <div className="mt-4 pt-3 border-t border-zinc-800/60 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    {a.category && <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">{a.category}</Badge>}
                    {a.stats && a.stats.runs > 0 && <span>{t("marketplace.runsCount", { count: a.stats.runs })}</span>}
                  </div>
                  {a.listing && a.listing.price > 0 ? (
                    <Button
                      size="sm"
                      onClick={() => void buy(a)}
                      disabled={buying === a.id}
                      className="bg-amber-500 text-zinc-950 hover:bg-amber-400 h-8 text-xs font-semibold"
                    >
                      <Coins className="h-3.5 w-3.5" />
                      <span className="ml-1.5">
                        {buying === a.id ? "…" : t("marketplace.buy", { credits: a.listing.price })}
                      </span>
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => install(a.id)}
                      disabled={installing === a.id}
                      className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400 h-8 text-xs font-semibold"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span className="ml-1.5">{installing === a.id ? "…" : t("marketplace.install")}</span>
                    </Button>
                  )}
                </div>
                {a.listing && a.listing.price > 0 && (
                  <p className="text-[10px] text-zinc-600 mt-1.5">
                    {t("marketplace.commissionNote", { count: a.listing.purchases })}
                  </p>
                )}
                <p className="text-[10px] text-zinc-600 mt-2">{t("marketplace.published", { date: new Date(a.createdAt).toLocaleString(locale) })}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
