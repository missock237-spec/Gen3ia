"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { usePolling, apiPost, apiDelete } from "@/lib/client/hooks";
import { BookOpen, Plus, Trash2, Search, FileText, Upload } from "lucide-react";

interface DocRow {
  id: string
  title: string
  sourceType: string
  size: number
  createdAt: string
}

export default function KnowledgePage() {
  const { toast } = useToast();
  const { t, lang } = useI18n();
  const { data, loading, reload } = usePolling<{ ok: boolean; documents: DocRow[] }>("/api/knowledge");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [adding, setAdding] = useState(false);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<{ title: string; score: number; excerpt: string }[] | null>(null);

  const locale = lang === "fr" ? "fr-FR" : "en-US";

  async function addDocument() {
    if (file) {
      const text = await file.text()
      if (text.length < 20) {
        toast({ title: t("knowledge.errors.fileShort"), description: t("knowledge.errors.fileShortDesc"), variant: "destructive" })
        return
      }
      setAdding(true)
      const res = await apiPost("/api/knowledge", {
        title: title || file.name,
        content: text.slice(0, 200000),
        sourceType: "FILE",
      })
      setAdding(false)
      if (!res.ok) {
        toast({ title: t("knowledge.errors.add"), description: res.error, variant: "destructive" })
        return
      }
      toast({ title: t("knowledge.indexed.title"), description: t("knowledge.indexed.fileDesc", { file: file.name }) })
      setFile(null); setTitle(""); setContent("")
      await reload()
      return
    }
    if (title.trim().length < 2 || content.trim().length < 20) {
      toast({ title: t("knowledge.errors.incomplete"), description: t("knowledge.errors.incompleteDesc"), variant: "destructive" })
      return
    }
    setAdding(true)
    const res = await apiPost("/api/knowledge", { title: title.trim(), content: content.trim(), sourceType: "TEXT" })
    setAdding(false)
    if (!res.ok) {
      toast({ title: t("knowledge.errors.add"), description: res.error, variant: "destructive" })
      return
    }
    toast({ title: t("knowledge.indexed.title"), description: t("knowledge.indexed.desc") })
    setTitle(""); setContent("")
    await reload()
  }

  async function removeDoc(id: string) {
    const res = await apiDelete(`/api/knowledge/${id}`)
    if (!res.ok) {
      toast({ title: t("knowledge.errors.delete"), description: res.error, variant: "destructive" })
      return
    }
    await reload()
  }

  async function runSearch() {
    if (query.trim().length < 2) return
    setSearching(true)
    const res = await apiPost<{ results: typeof results }>("/api/knowledge/search", { query: query.trim() })
    setSearching(false)
    if (!res.ok) {
      toast({ title: t("knowledge.errors.search"), description: res.error, variant: "destructive" })
      return
    }
    setResults(res.results ?? [])
  }

  const documents = data?.documents ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("knowledge.title")}</h1>
        <p className="text-sm text-zinc-400 mt-1">
          {t("knowledge.subtitle")}
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="bg-zinc-900/40 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Plus className="h-4 w-4 text-emerald-400" />{t("knowledge.add.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">{t("knowledge.form.title")}</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("knowledge.form.titlePlaceholder")} className="bg-zinc-950 border-zinc-800" />
            </div>
            <div className="space-y-2">
              <Label>{t("knowledge.form.text")}</Label>
              <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder={t("knowledge.form.textPlaceholder")} className="min-h-[120px] bg-zinc-950 border-zinc-800 font-mono text-sm" />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 border border-dashed border-zinc-700 rounded-lg p-3 text-center">
                <label className="cursor-pointer flex items-center justify-center gap-2 text-sm text-zinc-400 hover:text-zinc-200">
                  <Upload className="h-4 w-4" />
                  {file ? file.name : t("knowledge.form.importFile")}
                  <input
                    type="file"
                    accept=".txt,.md,.json,.csv,text/plain"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                {file && <p className="text-[11px] text-emerald-400 mt-1">{t("knowledge.form.sizeKb", { size: (file.size / 1024).toFixed(1) })}</p>}
              </div>
            </div>
            <Button onClick={addDocument} disabled={adding} className="w-full bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-semibold">
              {adding ? t("knowledge.form.indexing") : t("knowledge.form.index")}
            </Button>
            <p className="text-xs text-zinc-500">
              {t("knowledge.form.hint")}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/40 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Search className="h-4 w-4 text-emerald-400" />{t("knowledge.search.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runSearch()} placeholder={t("knowledge.search.placeholder")} className="bg-zinc-950 border-zinc-800" />
              <Button onClick={runSearch} disabled={searching || query.trim().length < 2} className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
                <Search className="h-4 w-4" />
              </Button>
            </div>
            {results && (
              <div className="space-y-3 max-h-72 overflow-y-auto">
                {results.length === 0 ? (
                  <p className="text-sm text-zinc-500 text-center py-6">{t("knowledge.search.empty")}</p>
                ) : (
                  results.map((r, i) => (
                    <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-zinc-200">{r.title}</span>
                        <span className="text-xs font-mono text-emerald-400">{r.score.toFixed(3)}</span>
                      </div>
                      <p className="text-xs text-zinc-500 mt-1.5 line-clamp-3">{r.excerpt}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-zinc-900/40 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base">{t("knowledge.documents", { count: documents.length })}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full bg-zinc-800/60" />)}</div>
          ) : documents.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              <BookOpen className="h-10 w-10 mx-auto mb-3 text-zinc-700" />
              <p className="text-sm">{t("knowledge.empty")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800/60 bg-zinc-950 px-4 py-3">
                  <div className="min-w-0 flex-1 flex items-center gap-3">
                    <FileText className="h-4 w-4 text-emerald-400/70 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-zinc-200 truncate">{d.title}</p>
                      <p className="text-xs text-zinc-500">
                        {d.sourceType} · {t("knowledge.form.sizeKb", { size: (d.size / 1024).toFixed(1) })} · {new Date(d.createdAt).toLocaleString(locale)}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => removeDoc(d.id)}
                    className="text-zinc-500 hover:text-red-400 hover:bg-red-500/10 h-8"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
