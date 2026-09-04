"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import { Loader2, Layers, PlayCircle, RefreshCw, Mic, MicOff } from "lucide-react";
import { useDictation } from "@/components/chat/use-dictation";

/**
 * Batch Tasks — exécution en série de multiples prompts (jusqu'à 50).
 * Page exposant le moteur batch (BatchTask/BatchItem).
 */

interface BatchView {
  id: string;
  name: string | null;
  status: string;
  total: number;
  completed: number;
  failed: number;
  createdAt: string;
}

const STATUS_META: Record<string, { labelKey: TranslationKey; cls: string }> = {
  PENDING: { labelKey: "batch.status.PENDING", cls: "border-zinc-700 text-zinc-400" },
  RUNNING: { labelKey: "batch.status.RUNNING", cls: "border-blue-700/50 text-blue-300" },
  COMPLETED: { labelKey: "batch.status.COMPLETED", cls: "border-emerald-700/50 text-emerald-300" },
  FAILED: { labelKey: "batch.status.FAILED", cls: "border-red-800/60 text-red-300" },
};

export default function BatchPage() {
  const { toast } = useToast();
  const { t, lang } = useI18n();
  const locale = lang === "fr" ? "fr-FR" : "en-US";
  const [batches, setBatches] = useState<BatchView[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [prompts, setPrompts] = useState("")
  // v4.1 — dictée vocale : chaque phrase transcrite devient une ligne du lot.
  const dictation = useDictation((text) => {
    setPrompts((p) => (p.trim() ? `${p}\n${text}` : text))
  });
  const [name, setName] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ batch?: { items?: Array<{ id: string; prompt?: string; status: string; taskId?: string }> } } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/batch");
      const json = (await res.json()) as { ok: boolean; batches?: BatchView[] };
      if (json.ok && json.batches) setBatches(json.batches);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function launch() {
    const list = prompts
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
    if (list.length === 0) {
      toast({ title: t("batch.errors.noPrompts"), description: t("batch.errors.noPromptsDesc"), variant: "destructive" })
      return
    }
    if (list.length > 50) {
      toast({ title: t("batch.errors.tooMany"), description: t("batch.errors.tooManyDesc"), variant: "destructive" })
      return
    }
    setRunning(true)
    try {
      const res = await fetch("/api/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompts: list, name: name || undefined, autoExecute: true }),
      })
      const json = (await res.json()) as { ok: boolean; batchId?: string; error?: string }
      if (json.ok) {
        toast({ title: t("batch.launched.title"), description: t("batch.launched.desc", { count: list.length }) })
        setPrompts("")
        setName("")
        await refresh()
      } else {
        toast({ title: t("batch.errors.launchFailed"), description: json.error, variant: "destructive" })
      }
    } finally {
      setRunning(false)
    }
  }

  async function openBatch(id: string) {
    setActiveId(id)
    setDetail(null)
    const res = await fetch(`/api/batch/${id}`)
    const json = (await res.json()) as { ok: boolean } & { batch?: { items?: Array<{ id: string; prompt?: string; status: string; taskId?: string }> } }
    if (json.ok) setDetail(json)
  }

  async function rerun(id: string) {
    setRunning(true)
    try {
      const res = await fetch(`/api/batch/${id}`, { method: "POST" })
      const json = (await res.json()) as { ok: boolean; error?: string }
      if (json.ok) {
        toast({ title: t("batch.rerun.title"), description: t("batch.rerun.desc") })
        await refresh()
      } else {
        toast({ title: t("batch.errors.rerunFailed"), description: json.error, variant: "destructive" })
      }
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("batch.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-400">
          {t("batch.subtitle")}
        </p>
      </div>

      <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("batch.namePlaceholder")}
          className="bg-zinc-950 border-zinc-800"
        />
        <Textarea
          value={prompts}
          onChange={(e) => setPrompts(e.target.value)}
          rows={6}
          placeholder={t("batch.promptsPlaceholder")}
          className="bg-zinc-950 border-zinc-880 font-mono text-xs"
        />
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={dictation.toggle}
            disabled={!dictation.supported}
            className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
              dictation.listening
                ? "bg-red-500/20 text-red-400 animate-pulse"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            }`}
            aria-label={dictation.listening ? "Arrêter la dictée" : "Dicter"}
            title={dictation.listening ? "Arrêter la dictée" : "Dicter (micro vocal)"}
          >
            {dictation.transcribing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : dictation.listening ? (
              <MicOff className="h-3.5 w-3.5" />
            ) : (
              <Mic className="h-3.5 w-3.5" />
            )}
          </button>
          <span className="text-xs text-zinc-500">
            {t("batch.counter", { count: prompts.split("\n").filter((l) => l.trim()).length })}
          </span>
          <Button onClick={() => void launch()} disabled={running} className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            {t("batch.launch")}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : batches.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-zinc-400">
          {t("batch.empty")}
        </div>
      ) : (
        <div className="space-y-3">
          {batches.map((b) => {
            const statusMeta = STATUS_META[b.status];
            const meta = statusMeta
              ? { label: t(statusMeta.labelKey), cls: statusMeta.cls }
              : { label: b.status, cls: "border-zinc-700 text-zinc-400" };
            const pct = b.total > 0 ? Math.round((b.completed / b.total) * 100) : 0
            return (
              <div key={b.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-emerald-400" />
                    <span className="font-semibold text-zinc-100">{b.name ?? t("batch.defaultName", { id: b.id.slice(0, 8) })}</span>
                    <Badge variant="outline" className={meta.cls}>{meta.label}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => void openBatch(b.id)}>
                      {t("common.details")}
                    </Button>
                    <Button size="sm" variant="outline" disabled={running} onClick={() => void rerun(b.id)}>
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-zinc-500">
                    <span>
                      {t("batch.progress", { completed: b.completed, total: b.total })}
                      {b.failed > 0 && ` · ${t("batch.failures", { count: b.failed })}`}
                    </span>
                    <span>{pct}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <span className="mt-2 block text-[11px] text-zinc-600">
                  {new Date(b.createdAt).toLocaleString(locale)}
                </span>

                {activeId === b.id && (
                  <div className="mt-3 border-t border-zinc-800 pt-3">
                    {detail?.batch?.items ? (
                      <div className="max-h-60 space-y-1.5 overflow-y-auto">
                        {detail.batch.items.map((it) => (
                          <div key={it.id} className="flex items-center gap-2 rounded-lg border border-zinc-800/60 bg-zinc-950/40 px-3 py-2 text-xs">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${it.status === "COMPLETED" ? "bg-emerald-500" : it.status === "RUNNING" ? "bg-blue-500" : it.status === "FAILED" ? "bg-red-500" : "bg-zinc-600"}`} />
                            <span className="truncate text-zinc-300">{it.prompt ?? it.taskId}</span>
                            <span className="ml-auto shrink-0 text-zinc-600">{it.status}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
