"use client";

import Link from "next/link";
import { usePolling } from "@/lib/client/hooks";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/app/status-badge";
import { useI18n } from "@/lib/i18n";
import { Bot, Plus, Rocket, Store, ArrowRight } from "lucide-react";

interface AgentRow {
  id: string
  name: string
  slug: string
  description: string | null
  status: string
  visibility: string
  category: string | null
  stats: string | null
  createdAt: string
  _count: { tasks: number }
}

export default function AgentsPage() {
  const { t, lang } = useI18n();
  const { data, loading } = usePolling<{ ok: boolean; agents: AgentRow[] }>("/api/agents");

  const agents = data?.agents ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("agents.title")}</h1>
          <p className="text-sm text-zinc-400 mt-1">
            {t("agents.subtitle")}
          </p>
        </div>
        <Link href="/agents/new">
          <Button className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-semibold">
            <Plus className="h-4 w-4 mr-2" />
            {t("agents.createAgent")}
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-44 w-full bg-zinc-800/60" />)}
        </div>
      ) : agents.length === 0 ? (
        <Card className="border-zinc-800 bg-zinc-900/40">
          <CardContent className="py-16 text-center">
            <Bot className="h-12 w-12 mx-auto mb-4 text-zinc-700" />
            <h3 className="font-semibold text-zinc-200">{t("agents.empty.title")}</h3>
            <p className="text-sm text-zinc-500 mt-1 max-w-md mx-auto">
              {t("agents.empty.desc")}
            </p>
            <Link href="/agents/new" className="mt-6 inline-block">
              <Button className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-semibold">
                <Plus className="h-4 w-4 mr-2" /> {t("agents.empty.cta")}
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((a) => {
            const stats = a.stats ? JSON.parse(a.stats) : null
            return (
              <Link key={a.id} href={`/agents/${a.id}`}>
                <Card className="h-full bg-zinc-900/40 border-zinc-800 hover:border-emerald-500/40 transition-colors">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                        <Bot className="h-5 w-5 text-emerald-400" />
                      </div>
                      <StatusBadge status={a.status} />
                    </div>
                    <h3 className="font-semibold mt-3 text-zinc-100 truncate">{a.name}</h3>
                    <p className="text-xs text-zinc-500 font-mono mt-0.5">/{a.slug}</p>
                    <p className="text-sm text-zinc-400 mt-2 line-clamp-2 min-h-[2.5rem]">
                      {a.description ?? t("agents.noDescription")}
                    </p>
                    <div className="mt-4 pt-3 border-t border-zinc-800/60 flex items-center justify-between text-xs text-zinc-500">
                      <span>{t("agents.tasksCount", { count: a._count.tasks })}</span>
                      {stats && <span>{t("agents.runsCount", { count: stats.runs })}</span>}
                      <span className="flex items-center gap-1.5">
                        {a.visibility === "MARKETPLACE" && <Store className="h-3.5 w-3.5 text-emerald-400" />}
                        {a.status === "PUBLISHED" && <Rocket className="h-3.5 w-3.5 text-emerald-400" />}
                        {new Date(a.createdAt).toLocaleString(lang === "fr" ? "fr-FR" : "en-US")}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
