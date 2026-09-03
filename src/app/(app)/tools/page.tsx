"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { usePolling } from "@/lib/client/hooks";
import { useI18n } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import { Wrench, ShieldAlert } from "lucide-react";

interface Tool {
  key: string
  name: string
  description: string
  category: string
  dangerous: boolean
  parameters: Record<string, { type: string; description: string; required: boolean }>
}

const CATEGORY_LABELS: Record<string, TranslationKey> = {
  INFORMATION: "tools.categories.INFORMATION",
  UTILITAIRE: "tools.categories.UTILITAIRE",
  EXECUTION: "tools.categories.EXECUTION",
  MEMOIRE: "tools.categories.MEMOIRE",
  GENERAL: "tools.categories.GENERAL",
}

export default function ToolsPage() {
  const { t } = useI18n();
  const { data, loading } = usePolling<{ ok: boolean; tools: Tool[] }>("/api/tools");
  const tools = data?.tools ?? [];
  const categories = [...new Set(tools.map((tool) => tool.category))];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("tools.title")}</h1>
        <p className="text-sm text-zinc-400 mt-1">
          {t("tools.subtitle")}
        </p>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-36 bg-zinc-800/60" />)}
        </div>
      ) : (
        categories.map((cat) => (
          <div key={cat}>
            <h2 className="text-sm font-semibold text-zinc-300 mb-3">{CATEGORY_LABELS[cat] ? t(CATEGORY_LABELS[cat]) : cat}</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {tools.filter((tool) => tool.category === cat).map((tool) => (
                <Card key={tool.key} className="bg-zinc-900/40 border-zinc-800">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                          {tool.dangerous ? <ShieldAlert className="h-4 w-4 text-orange-400" /> : <Wrench className="h-4 w-4 text-emerald-400" />}
                        </div>
                        <h3 className="font-medium text-sm text-zinc-100 truncate">{tool.name}</h3>
                      </div>
                      <code className="text-[10px] font-mono text-zinc-600 shrink-0">{tool.key}</code>
                    </div>
                    <p className="text-xs text-zinc-400 mt-2.5 leading-relaxed">{tool.description}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {Object.keys(tool.parameters).length === 0 ? (
                        <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[10px]">{t("tools.noParams")}</Badge>
                      ) : (
                        Object.entries(tool.parameters).map(([name, p]) => (
                          <Badge key={name} variant="outline" className={`text-[10px] font-mono ${p.required ? "border-emerald-700/40 text-emerald-300/80" : "border-zinc-700 text-zinc-500"}`}>
                            {name}{p.required ? " *" : ""}
                          </Badge>
                        ))
                      )}
                    </div>
                    {tool.dangerous && (
                      <p className="text-[11px] text-orange-300/80 mt-2.5 flex items-center gap-1.5">
                        <ShieldAlert className="h-3 w-3" />
                        {t("tools.humanConfirm")}
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
