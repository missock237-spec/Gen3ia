"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/app/status-badge";
import { ChatComposer, type ChatComposerSubmit } from "@/components/chat/chat-composer";
import { findWorkflow } from "@/lib/workflows/catalog";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { usePolling, apiPost, formatCredits } from "@/lib/client/hooks";
import { Zap, ChevronRight, Bot, Search } from "lucide-react";

interface TaskRow {
  id: string
  prompt: string
  status: string
  costCredits: number
  attempts: number
  selectedPlanId: string | null
  agentId: string | null
  createdAt: string
}

export default function TasksPage() {
  const { toast } = useToast();
  const { t, lang } = useI18n();
  const router = useRouter();
  const [agentId, setAgentId] = useState("")
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState("")
  // v4.1 — workflow pré-chargé depuis la bibliothèque (/tasks?template=key).
  const [templatePrompt, setTemplatePrompt] = useState("")
  const { data, loading, reload } = usePolling<{ ok: boolean; tasks: TaskRow[] }>("/api/tasks", 5000)
  const { data: agentsData } = usePolling<{ ok: boolean; agents: { id: string; name: string; status: string }[] }>("/api/agents")

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const key = params.get("template")
    if (!key) return
    const workflow = findWorkflow(key)
    if (!workflow) return
    setTemplatePrompt(workflow.prompt[lang] ?? workflow.prompt.fr)
    toast({ title: t("workflows.templateLoaded"), description: workflow.title[lang] ?? workflow.title.fr })
    // Nettoie l'URL (le prompt reste dans la barre de saisie).
    window.history.replaceState({}, "", "/tasks")
  }, [lang, t])

  const tasks = data?.tasks ?? []
  const agents = (agentsData?.agents ?? []).filter((a) => a.status !== "ARCHIVED")
  // v4.1 (captures) — recherche de projets/tâches.
  const filtered = search.trim()
    ? tasks.filter((task) => task.prompt.toLowerCase().includes(search.trim().toLowerCase()))
    : tasks

  async function createTask(payload: ChatComposerSubmit) {
    const prompt = payload.text
    if (prompt.trim().length < 10) {
      toast({ title: t("tasks.errors.tooShort"), description: t("tasks.errors.tooShortDesc"), variant: "destructive" })
      return
    }
    setCreating(true)
    try {
      const res = await apiPost<{ task: { id: string } }>("/api/tasks", {
        prompt: prompt.trim(),
        agentId: agentId || null,
        preferredModel: payload.model,
        attachmentIds: payload.attachments.map((a) => a.id),
      })
      if (!res.ok) throw new Error(res.error)
      toast({ title: t("tasks.launched.title"), description: t("tasks.launched.desc") })
      await reload()
      router.push(`/tasks/${res.task.id}`)
    } catch (err) {
      toast({ title: t("tasks.errors.launchFailed"), description: err instanceof Error ? err.message : "", variant: "destructive" })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("tasks.title")}</h1>
        <p className="text-sm text-zinc-400 mt-1">
          {t("tasks.subtitle")}
        </p>
      </div>

      {/* Création */}
      <Card className="bg-zinc-900/40 border-zinc-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-emerald-400" /> {t("tasks.new")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* v4.1 — barre de saisie enrichie : micro vocal, envoi, + (connecteurs/fichiers tous types), modèle */}
          <ChatComposer
            defaultValue={templatePrompt}
            onSend={createTask}
            sending={creating}
            sendLabel={t("tasks.launch")}
            placeholder={t("tasks.promptPlaceholder")}
            minLength={10}
            rows={3}
          />
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs text-zinc-500">{t("tasks.agentOptional")}</label>
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="w-full h-9 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
              >
                <option value="">{t("tasks.agentNone")}</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Liste */}
      <Card className="bg-zinc-900/40 border-zinc-800">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base">{t("tasks.listTitle", { count: filtered.length })}</CardTitle>
            {/* v4.1 (captures) — recherche des tâches */}
            <div className="relative sm:w-72">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("tasks.searchPlaceholder")}
                className="h-9 w-full rounded-md border border-zinc-800 bg-zinc-950 pl-9 pr-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full bg-zinc-800/60" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              <Zap className="h-10 w-10 mx-auto mb-3 text-zinc-700" />
              <p className="text-sm">{search.trim() ? t("tasks.searchEmpty", { query: search.trim() }) : t("tasks.empty")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((task) => (
                <Link
                  key={task.id}
                  href={`/tasks/${task.id}`}
                  className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800/60 bg-zinc-950 px-4 py-3.5 hover:border-emerald-500/30 transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-zinc-200 truncate group-hover:text-white">{task.prompt}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                      <span>{new Date(task.createdAt).toLocaleString(lang === "fr" ? "fr-FR" : "en-US")}</span>
                      {task.selectedPlanId && <span className="font-mono">{t("tasks.planBadge", { id: task.selectedPlanId })}</span>}
                      {task.costCredits > 0 && <span className="text-emerald-400/80">{t("tasks.credits", { credits: formatCredits(task.costCredits) })}</span>}
                      {task.agentId && <span className="flex items-center gap-1"><Bot className="h-3 w-3" />{t("tasks.agentBadge")}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={task.status} />
                    <ChevronRight className="h-4 w-4 text-zinc-600 group-hover:text-emerald-400" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
