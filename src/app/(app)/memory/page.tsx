"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import { usePolling, apiPost, apiDelete } from "@/lib/client/hooks";
import { Database, Plus, Trash2, Clock, GraduationCap, User, Bot, Briefcase, Zap } from "lucide-react";

interface MemoryRow {
  id: string
  layer: string
  content: string
  importance: number
  createdAt: string
}

const LAYER_META: Record<string, { labelKey: TranslationKey; descKey: TranslationKey; icon: React.ReactNode }> = {
  SHORT_TERM: { labelKey: "memory.layers.SHORT_TERM.label", descKey: "memory.layers.SHORT_TERM.desc", icon: <Clock className="h-4 w-4" /> },
  LONG_TERM: { labelKey: "memory.layers.LONG_TERM.label", descKey: "memory.layers.LONG_TERM.desc", icon: <GraduationCap className="h-4 w-4" /> },
  TASK: { labelKey: "memory.layers.TASK.label", descKey: "memory.layers.TASK.desc", icon: <Briefcase className="h-4 w-4" /> },
  USER: { labelKey: "memory.layers.USER.label", descKey: "memory.layers.USER.desc", icon: <User className="h-4 w-4" /> },
  AGENT: { labelKey: "memory.layers.AGENT.label", descKey: "memory.layers.AGENT.desc", icon: <Bot className="h-4 w-4" /> },
}

export default function MemoryPage() {
  const { toast } = useToast();
  const { t, lang } = useI18n();
  const { data, loading, reload } = usePolling<{ ok: boolean; layers: Record<string, MemoryRow[]> }>("/api/memory");
  const [layer, setLayer] = useState("USER");
  const [content, setContent] = useState("");
  const [adding, setAdding] = useState(false);

  const locale = lang === "fr" ? "fr-FR" : "en-US";

  async function addMemory() {
    if (content.trim().length < 3) return
    setAdding(true)
    const res = await apiPost("/api/memory", { layer, content: content.trim() })
    setAdding(false)
    if (!res.ok) {
      toast({ title: t("memory.errors.write"), description: res.error, variant: "destructive" })
      return
    }
    toast({ title: t("memory.saved.title"), description: t("memory.saved.desc") })
    setContent("")
    await reload()
  }

  async function removeMemory(id: string) {
    const res = await apiDelete(`/api/memory/${id}`)
    if (!res.ok) {
      toast({ title: t("memory.errors.delete"), description: res.error, variant: "destructive" })
      return
    }
    await reload()
  }

  const layers = data?.layers ?? {}
  const total = Object.values(layers).reduce((acc, arr) => acc + arr.length, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("memory.title", { count: total })}</h1>
        <p className="text-sm text-zinc-400 mt-1">
          {t("memory.subtitle")}
        </p>
      </div>

      <Card className="bg-zinc-900/40 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Plus className="h-4 w-4 text-emerald-400" />{t("memory.write.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-[220px_1fr] gap-4">
            <div className="space-y-2">
              <Label>{t("memory.write.layer")}</Label>
              <select
                value={layer}
                onChange={(e) => setLayer(e.target.value)}
                className="w-full h-9 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
              >
                {Object.entries(LAYER_META).map(([key, meta]) => (
                  <option key={key} value={key}>{t(meta.labelKey)}</option>
                ))}
              </select>
              <p className="text-xs text-zinc-500">{LAYER_META[layer] ? t(LAYER_META[layer].descKey) : undefined}</p>
            </div>
            <div className="space-y-2">
              <Label>{t("memory.write.content")}</Label>
              <div className="flex gap-2">
                <Input value={content} onChange={(e) => setContent(e.target.value)} placeholder={t("memory.write.placeholder")} className="bg-zinc-950 border-zinc-800" />
                <Button onClick={addMemory} disabled={adding || content.trim().length < 3} className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
                  <Zap className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 bg-zinc-800/60" />)}</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(LAYER_META).map(([key, meta]) => {
            const items = layers[key] ?? []
            if (items.length === 0) return null
            return (
              <Card key={key} className="bg-zinc-900/40 border-zinc-800">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <span className="text-emerald-400">{meta.icon}</span>
                    {t(meta.labelKey)}
                    <span className="text-xs text-zinc-500 font-normal ml-2">{t(meta.descKey)}</span>
                    <span className="ml-auto text-xs font-mono text-zinc-500">{items.length}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {items.map((m) => (
                      <div key={m.id} className="flex items-start justify-between gap-3 rounded-lg border border-zinc-800/60 bg-zinc-950 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-zinc-300">{m.content}</p>
                          <p className="text-[11px] text-zinc-600 mt-1 font-mono">
                            {t("memory.item.meta", { importance: m.importance.toFixed(2), date: new Date(m.createdAt).toLocaleString(locale) })}
                          </p>
                        </div>
                        <Button
                          size="sm" variant="ghost"
                          onClick={() => removeMemory(m.id)}
                          className="h-7 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )
          })}
          {total === 0 && (
            <Card className="border-zinc-800 bg-zinc-900/40">
              <CardContent className="py-12 text-center text-zinc-500">
                <Database className="h-10 w-10 mx-auto mb-3 text-zinc-700" />
                <p className="text-sm">{t("memory.empty")}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
