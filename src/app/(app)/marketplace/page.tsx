"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePolling, apiPost, useUser, formatDate } from "@/lib/client/hooks";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Store, Download, Star, Rocket } from "lucide-react";

interface MarketAgent {
  id: string
  name: string
  slug: string
  description: string | null
  category: string | null
  stats: { runs: number; success: number } | null
  createdAt: string
  rating: { avg: number | null; count: number } | null
}

export default function MarketplacePage() {
  const { toast } = useToast();
  const router = useRouter();
  const { user } = useUser();
  const { data, loading, reload } = usePolling<{ ok: boolean; agents: MarketAgent[] }>("/api/marketplace");
  const [installing, setInstalling] = useState<string | null>(null);

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
      toast({ title: "Installation impossible", description: data.error, variant: "destructive" })
      return
    }
    toast({ title: "Agent installé", description: "Une copie a été ajoutée à vos agents." })
    router.push("/agents")
  }

  const agents = data?.agents ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Store className="h-6 w-6 text-emerald-400" /> Marketplace
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Agents publiés par la communauté. Installez-en un : il est copié dans votre espace, prêt à personnaliser.
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
            <h3 className="font-semibold text-zinc-200">Marketplace vide pour l'instant</h3>
            <p className="text-sm mt-1 max-w-md mx-auto">
              Déployez un agent puis publiez-le depuis sa page (onglet « Déployer ») pour le lister ici.
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
                  {a.description ?? "Pas de description."}
                </p>
                <div className="mt-4 pt-3 border-t border-zinc-800/60 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    {a.category && <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-[10px]">{a.category}</Badge>}
                    {a.stats && a.stats.runs > 0 && <span>{a.stats.runs} exécutions</span>}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => install(a.id)}
                    disabled={installing === a.id}
                    className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400 h-8 text-xs font-semibold"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span className="ml-1.5">{installing === a.id ? "…" : "Installer"}</span>
                  </Button>
                </div>
                <p className="text-[10px] text-zinc-600 mt-2">Publié le {formatDate(a.createdAt)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
