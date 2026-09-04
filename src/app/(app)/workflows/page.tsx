"use client";

/**
 * Page /workflows — bibliothèque de modèles de tâches (v4.1, captures 2-4).
 *
 * Reproduit la structure observée (runable.com/workflows) :
 *  - cartes par catégorie (icône, titre, description) ;
 *  - épinglage (pin) persisté par utilisateur (/api/workflows) ;
 *  - section « épinglés » en tête ;
 *  - recherche ;
 *  - « Utiliser » → pré-remplit la barre de saisie du Task Center
 *    (/tasks?template=<key>), qui traverse le pipeline complet.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { apiPost } from "@/lib/client/hooks";
import {
  WorkflowTemplate, WorkflowCategory, WORKFLOW_CATALOG, WORKFLOW_CATEGORIES,
} from "@/lib/workflows/catalog";
import {
  Loader2, Pin, PinOff, Search, Sparkles, Play, FileCheck, Mail, Briefcase, Timer,
  GraduationCap, PlayCircle, Megaphone, Code, GitPullRequest, Bug, Presentation,
  Radar, Newspaper, FileText, BarChart3, Database, Wrench,
} from "lucide-react";

// Icônes statiques (catalogue versionné → mapping sûr, aucun import dynamique).
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "file-check": FileCheck,
  mail: Mail,
  briefcase: Briefcase,
  timer: Timer,
  "graduation-cap": GraduationCap,
  "play-circle": PlayCircle,
  megaphone: Megaphone,
  code: Code,
  "git-pull-request": GitPullRequest,
  bug: Bug,
  presentation: Presentation,
  radar: Radar,
  newspaper: Newspaper,
  "file-text": FileText,
  "bar-chart-3": BarChart3,
  database: Database,
}

interface WorkflowPinState {
  pinned: Set<string>
}

export default function WorkflowsPage() {
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<WorkflowPinState>({ pinned: new Set() });
  const [pendingPin, setPendingPin] = useState<string | null>(null);

  // Chargement initial du catalogue + épingles.
  useEffect(() => {
    let cancelled = false
    fetch("/api/workflows")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled && json?.workflows) {
          setState({ pinned: new Set<string>(json.pinned ?? []) })
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, []);

  async function togglePin(workflow: WorkflowTemplate) {
    const key = workflow.key
    const willPin = !state.pinned.has(key)
    setPendingPin(key)
    try {
      const res = await apiPost("/api/workflows", { workflowKey: key, pinned: willPin })
      if (!res.ok) throw new Error(res.error)
      setState((s) => {
        const next = new Set(s.pinned)
        if (willPin) next.add(key)
        else next.delete(key)
        return { pinned: next }
      })
    } catch (err) {
      toast({
        title: t("common.error"),
        description: err instanceof Error ? err.message : "",
        variant: "destructive",
      })
    } finally {
      setPendingPin(null)
    }
  }

  function launchWorkflow(workflow: WorkflowTemplate) {
    router.push(`/tasks?template=${encodeURIComponent(workflow.key)}`)
  }

  const match = (w: WorkflowTemplate) => {
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return (
      w.title.fr.toLowerCase().includes(q) ||
      w.title.en.toLowerCase().includes(q) ||
      w.description.fr.toLowerCase().includes(q) ||
      w.description.en.toLowerCase().includes(q)
    )
  }

  const pinnedWorkflows = WORKFLOW_CATALOG.filter((w) => state.pinned.has(w.key) && match(w))
  const catMap = new Map(WORKFLOW_CATEGORIES.map((c) => [c.key, c]))

  const WorkflowCard = ({ workflow }: { workflow: WorkflowTemplate }) => {
    const Icon = ICONS[workflow.icon] ?? Wrench
    const isPinned = state.pinned.has(workflow.key)
    return (
      <Card className="bg-zinc-900/40 border-zinc-800 hover:border-zinc-700 transition-colors">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-800/80 border border-zinc-700">
              <Icon className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-sm text-zinc-100">{workflow.title[lang] ?? workflow.title.fr}</h3>
              <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed line-clamp-2">
                {workflow.description[lang] ?? workflow.description.fr}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void togglePin(workflow)}
              disabled={pendingPin === workflow.key}
              className={`shrink-0 rounded-lg p-1.5 transition-colors ${
                isPinned
                  ? "text-emerald-400 hover:bg-zinc-800"
                  : "text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
              }`}
              aria-label={isPinned ? t("workflows.unpin") : t("workflows.pin")}
              title={isPinned ? t("workflows.unpin") : t("workflows.pin")}
            >
              {pendingPin === workflow.key ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isPinned ? (
                <Pin className="h-4 w-4 fill-current" />
              ) : (
                <Pin className="h-4 w-4" />
              )}
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1">
              {workflow.tools.slice(0, 3).map((tool) => (
                <code key={tool} className="text-[10px] font-mono text-zinc-600 border border-zinc-800 rounded px-1.5 py-0.5">
                  {tool}
                </code>
              ))}
            </div>
            <Button
              size="sm"
              onClick={() => launchWorkflow(workflow)}
              className="h-7 gap-1.5 bg-emerald-500 text-zinc-950 hover:bg-emerald-400 text-xs font-semibold px-3"
            >
              <Play className="h-3 w-3" />
              {t("workflows.use")}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-emerald-400" /> {t("workflows.title")}
        </h1>
        <p className="text-sm text-zinc-400 mt-1">{t("workflows.subtitle")}</p>
      </div>

      {/* Recherche */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("workflows.search")}
          className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950 pl-9 pr-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
        />
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-32 bg-zinc-800/60" />)}
        </div>
      ) : (
        <div className="space-y-8">
          {/* Épinglés */}
          {pinnedWorkflows.length > 0 && (
            <section>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-emerald-400 mb-3">
                <Pin className="h-3.5 w-3.5 fill-current" /> {t("workflows.pinned")}
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {pinnedWorkflows.map((w) => <WorkflowCard key={w.key} workflow={w} />)}
              </div>
            </section>
          )}

          {/* Catégories */}
          {WORKFLOW_CATEGORIES.map((cat) => {
            const items = WORKFLOW_CATALOG.filter((w) => w.category === cat.key && match(w))
            if (items.length === 0) return null
            return (
              <section key={cat.key}>
                <h2 className="text-sm font-semibold text-zinc-300 mb-3">
                  {cat.label[lang] ?? cat.label.fr}
                </h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  {items.map((w) => <WorkflowCard key={w.key} workflow={w} />)}
                </div>
              </section>
            )
          })}

          {pinnedWorkflows.length === 0 && catMap.size === 0 && (
            <div className="text-center py-12 text-zinc-500 text-sm border border-dashed border-zinc-800/80 rounded-xl">
              {t("workflows.emptySearch")}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
