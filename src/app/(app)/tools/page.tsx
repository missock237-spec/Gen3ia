"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { usePolling } from "@/lib/client/hooks";
import { Wrench, ShieldAlert } from "lucide-react";

interface Tool {
  key: string
  name: string
  description: string
  category: string
  dangerous: boolean
  parameters: Record<string, { type: string; description: string; required: boolean }>
}

const CATEGORY_LABELS: Record<string, string> = {
  INFORMATION: "Information",
  UTILITAIRE: "Utilitaire",
  EXECUTION: "Exécution",
  MEMOIRE: "Mémoire",
  GENERAL: "Général",
}

export default function ToolsPage() {
  const { data, loading } = usePolling<{ ok: boolean; tools: Tool[] }>("/api/tools");
  const tools = data?.tools ?? [];
  const categories = [...new Set(tools.map((t) => t.category))];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Outils</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Le catalogue d'outils réels exécutables pendant les tâches. Les outils marqués « sensible »
          déclenchent une confirmation humaine avant exécution.
        </p>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-36 bg-zinc-800/60" />)}
        </div>
      ) : (
        categories.map((cat) => (
          <div key={cat}>
            <h2 className="text-sm font-semibold text-zinc-300 mb-3">{CATEGORY_LABELS[cat] ?? cat}</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {tools.filter((t) => t.category === cat).map((t) => (
                <Card key={t.key} className="bg-zinc-900/40 border-zinc-800">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                          {t.dangerous ? <ShieldAlert className="h-4 w-4 text-orange-400" /> : <Wrench className="h-4 w-4 text-emerald-400" />}
                        </div>
                        <h3 className="font-medium text-sm text-zinc-100 truncate">{t.name}</h3>
                      </div>
                      <code className="text-[10px] font-mono text-zinc-600 shrink-0">{t.key}</code>
                    </div>
                    <p className="text-xs text-zinc-400 mt-2.5 leading-relaxed">{t.description}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {Object.keys(t.parameters).length === 0 ? (
                        <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[10px]">aucun paramètre</Badge>
                      ) : (
                        Object.entries(t.parameters).map(([name, p]) => (
                          <Badge key={name} variant="outline" className={`text-[10px] font-mono ${p.required ? "border-emerald-700/40 text-emerald-300/80" : "border-zinc-700 text-zinc-500"}`}>
                            {name}{p.required ? " *" : ""}
                          </Badge>
                        ))
                      )}
                    </div>
                    {t.dangerous && (
                      <p className="text-[11px] text-orange-300/80 mt-2.5 flex items-center gap-1.5">
                        <ShieldAlert className="h-3 w-3" />
                        Confirmation humaine requise
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
