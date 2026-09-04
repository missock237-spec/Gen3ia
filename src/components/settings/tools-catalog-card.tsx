"use client";

/**
 * ToolsCatalogCard — catalogue d'outils intégré aux paramètres (v4.1).
 *
 * Mission : la page « outils » (page outils) est désormais UNE SECTION DES
 * PARAMÈTRES (capture 1 : panneau Paramètres avec sections). Le catalogue
 * complet (outils de base + actions d'app connectées) reste servi par
 * /api/tools — aucune duplication de logique.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { usePolling } from "@/lib/client/hooks";
import { useI18n } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import { Wrench, ShieldAlert, Plug } from "lucide-react";
import { useRouter } from "next/navigation";

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

export function ToolsCatalogCard() {
  const { t } = useI18n();
  const router = useRouter();
  const { data, loading } = usePolling<{ ok: boolean; tools: Tool[] }>("/api/tools");
  const tools = data?.tools ?? [];
  const categories = [...new Set(tools.map((tool) => tool.category))];

  return (
    <Card className="bg-zinc-900/40 border-zinc-800" id="tools">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Wrench className="h-4 w-4 text-emerald-400" /> {t("tools.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-xs text-zinc-500">{t("tools.subtitle")}</p>

        {loading ? (
          <div className="grid sm:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 bg-zinc-800/60" />)}
          </div>
        ) : (
          categories.map((cat) => (
            <div key={cat}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2.5">
                {CATEGORY_LABELS[cat] ? t(CATEGORY_LABELS[cat]) : cat}
              </h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {tools.filter((tool) => tool.category === cat).map((tool) => (
                  <div
                    key={tool.key}
                    className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                          {tool.dangerous ? <ShieldAlert className="h-3.5 w-3.5 text-orange-400" /> : <Wrench className="h-3.5 w-3.5 text-emerald-400" />}
                        </div>
                        <h4 className="font-medium text-sm text-zinc-100 truncate">{tool.name}</h4>
                      </div>
                      <code className="text-[10px] font-mono text-zinc-600 shrink-0">{tool.key}</code>
                    </div>
                    <p className="text-xs text-zinc-400 mt-2 leading-relaxed">{tool.description}</p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
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
                      <p className="text-[11px] text-orange-300/80 mt-2 flex items-center gap-1.5">
                        <ShieldAlert className="h-3 w-3" />
                        {t("tools.humanConfirm")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}

        {/* Accès direct aux connecteurs (300+ apps) — cohérent avec la barre de saisie */}
        <button
          type="button"
          onClick={() => router.push("/connectors")}
          className="flex w-full items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-left transition-colors hover:bg-emerald-500/10"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <Plug className="h-4.5 w-4.5 text-emerald-400" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-zinc-100">{t("input.attachMenu.connectors")}</span>
            <span className="block text-xs text-zinc-500">{t("input.attachMenu.connectorsDesc")}</span>
          </span>
        </button>
      </CardContent>
    </Card>
  )
}
