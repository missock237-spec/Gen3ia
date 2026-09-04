"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { usePolling, apiPost, apiPatch, formatDate } from "@/lib/client/hooks";
import {
  FileCode2, Folder, FolderOpen, Loader2, Save, Check, X, Pencil,
  Eye, History, Trash2, Plus, Search, ShieldCheck, Bot, User, FileText,
} from "lucide-react";

/**
 * Visualiseur de code — l'espace fichiers des agents de code.
 *
 * VOIR : arborescence + contenu coloré syntaxiquement.
 * DÉCIDER : approuver / rejeter chaque fichier proposé par un agent.
 * MODIFIER : édition inline → nouvelle version (source HUMAN), l'historique
 * complet est conservé et chaque version reste consultable.
 */

interface AgentFileRow {
  id: string
  path: string
  language: string
  status: string
  version: number
  bytes: number
  description: string | null
  taskId: string | null
  agentId: string | null
  createdAt: string
  updatedAt: string
}

interface FileDetail extends AgentFileRow {
  content: string
  versions: { version: number; source: string; createdAt: string; description: string | null }[]
}

/** Tokeniseur léger multi-langages (aucune dépendance lourde côté client). */
function highlight(code: string, language: string): Array<{ text: string; kind: string }> {
  const patterns: Record<string, Array<[RegExp, string]>> = {
    common: [
      [/(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)/, "comment"],
      [/("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)/, "string"],
      [/\b(\d+\.?\d*)\b/, "number"],
    ],
    javascript: [[/\b(const|let|var|function|return|if|else|for|while|class|extends|new|await|async|import|export|from|try|catch|finally|throw|typeof|instanceof|of|in|yield|switch|case|break|continue|do|delete|void)\b/, "keyword"]],
    typescript: [[/\b(const|let|var|function|return|if|else|for|while|class|extends|implements|interface|type|enum|new|await|async|import|export|from|try|catch|finally|throw|typeof|as|of|in|yield|switch|case|break|continue|readonly|public|private|protected|static|abstract|satisfies)\b/, "keyword"]],
    python: [[/\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|yield|lambda|global|nonlocal|pass|break|continue|assert|async|await)\b/, "keyword"]],
    sql: [[/\b(SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|ALTER|DROP|INDEX|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP|BY|ORDER|LIMIT|AS|AND|OR|NOT|NULL|PRIMARY|KEY|FOREIGN|REFERENCES|DEFAULT|DISTINCT|COUNT|SUM|AVG|MIN|MAX)\b/, "keyword"]],
    bash: [[/\b(if|then|else|fi|for|do|done|while|case|esac|function|echo|export|cd|ls|cat|grep|sed|awk|curl|wget|chmod|chown|mkdir|rm|cp|mv)\b/, "keyword"]],
  }
  const lang = patterns[language] ? [...patterns[language], ...patterns.common] : patterns.common

  const tokens: Array<{ text: string; kind: string }> = []
  let remaining = code
  let guard = 0
  while (remaining.length > 0 && guard++ < 20000) {
    let bestMatch: { text: string; kind: string; index: number } | null = null
    for (const [re, kind] of lang) {
      const m = re.exec(remaining)
      if (m && (bestMatch === null || m.index < bestMatch.index)) {
        bestMatch = { text: m[0], kind, index: m.index }
      }
    }
    if (!bestMatch || bestMatch.index > 0) {
      const chunk = bestMatch ? remaining.slice(0, bestMatch.index) : remaining
      if (chunk) tokens.push({ text: chunk, kind: "plain" })
    }
    if (bestMatch) {
      tokens.push({ text: bestMatch.text, kind: bestMatch.kind })
      remaining = remaining.slice(bestMatch.index + bestMatch.text.length)
    } else {
      remaining = ""
    }
  }
  return tokens
}

const KIND_CLASS: Record<string, string> = {
  comment: "text-zinc-600 italic",
  string: "text-amber-300/90",
  number: "text-purple-300",
  keyword: "text-emerald-300 font-medium",
  plain: "text-zinc-200",
}

const LANGUAGE_BADGE: Record<string, string> = {
  typescript: "border-blue-500/40 text-blue-300",
  javascript: "border-yellow-500/40 text-yellow-300",
  python: "border-teal-500/40 text-teal-300",
  json: "border-orange-500/40 text-orange-300",
  html: "border-red-500/40 text-red-300",
  css: "border-sky-500/40 text-sky-300",
  sql: "border-violet-500/40 text-violet-300",
  markdown: "border-zinc-500/40 text-zinc-300",
  bash: "border-lime-500/40 text-lime-300",
  text: "border-zinc-700 text-zinc-400",
}

const STATUS_BADGE: Record<string, { cls: string; key: string }> = {
  PROPOSED: { cls: "border-amber-500/40 text-amber-300", key: "files.statusProposed" },
  APPROVED: { cls: "border-emerald-500/40 text-emerald-300", key: "files.statusApproved" },
  REJECTED: { cls: "border-red-500/40 text-red-300", key: "files.statusRejected" },
  EDITED: { cls: "border-sky-500/40 text-sky-300", key: "files.statusEdited" },
}

/** Construit l'arborescence à partir des chemins plats. */
interface TreeNode {
  name: string
  path: string
  children: Map<string, TreeNode>
  file?: AgentFileRow
}

function buildTree(files: AgentFileRow[]): TreeNode {
  const root: TreeNode = { name: "", path: "", children: new Map() }
  for (const file of files) {
    const parts = file.path.split("/")
    let node = root
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      if (!node.children.has(part)) {
        node.children.set(part, {
          name: part,
          path: parts.slice(0, i + 1).join("/"),
          children: new Map(),
        })
      }
      node = node.children.get(part)!
      if (i === parts.length - 1) node.file = file
    }
  }
  return root
}

export function CodeViewer({ taskId }: { taskId?: string }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FileDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [showVersions, setShowVersions] = useState(false);
  const [compareVersion, setCompareVersion] = useState<number | null>(null);
  const [compareContent, setCompareContent] = useState<string | null>(null);

  const query = taskId ? `?taskId=${taskId}` : "";
  const { data, loading, reload } = usePolling<{ files: AgentFileRow[] }>(
    search ? `/api/agent-files${query}${query ? "&" : "?"}search=${encodeURIComponent(search)}` : `/api/agent-files${query}`,
    6000
  );
  const files = useMemo(() => data?.files ?? [], [data]);
  const tree = useMemo(() => buildTree(files), [files]);

  const loadDetail = useCallback(
    async (fileId: string) => {
      setDetailLoading(true);
      setEditing(false);
      setCompareVersion(null);
      try {
        const res = await fetch(`/api/agent-files/${fileId}`);
        const json = await res.json();
        if (res.ok && json.ok) {
          setDetail(json.file as FileDetail);
        } else {
          toast({ title: t("files.errors.loadFailed"), variant: "destructive" });
        }
      } catch {
        toast({ title: t("files.errors.loadFailed"), variant: "destructive" });
      } finally {
        setDetailLoading(false);
      }
    },
    [t, toast]
  );

  useEffect(() => {
    if (selectedId && !detail) void loadDetail(selectedId);
  }, [selectedId, detail, loadDetail]);

  async function decide(decision: "APPROVE" | "REJECT") {
    if (!detail) return;
    const res = await apiPatch(`/api/agent-files/${detail.id}`, { decision });
    if (!res.ok) {
      toast({ title: t("files.errors.decideFailed"), variant: "destructive" });
      return;
    }
    toast({ title: decision === "APPROVE" ? t("files.approved") : t("files.rejected") });
    setDetail({ ...detail, status: decision === "APPROVE" ? "APPROVED" : "REJECTED" });
    void reload();
  }

  async function save() {
    if (!detail) return;
    setSaving(true);
    const res = await apiPatch<{ version: number; bytes: number }>(`/api/agent-files/${detail.id}`, {
      content: draft,
    });
    setSaving(false);
    if (!res.ok) {
      toast({ title: t("files.errors.saveFailed"), description: res.error, variant: "destructive" });
      return;
    }
    toast({ title: t("files.saved"), description: t("files.savedDesc", { version: String(res.version) }) });
    setDetail(null)
    await loadDetail(detail.id);
    void reload();
  }

  async function loadCompare(version: number) {
    if (!detail) return;
    const res = await fetch(`/api/agent-files/${detail.id}?version=${version}`);
    const json = await res.json();
    if (res.ok && json.ok) {
      setCompareVersion(version);
      setCompareContent(json.version.content as string);
    }
  }

  async function remove() {
    if (!detail) return;
    const del = await fetch(`/api/agent-files/${detail.id}`, { method: "DELETE" });
    const json = await del.json();
    if (!del.ok || !json.ok) {
      toast({ title: t("files.errors.deleteFailed"), variant: "destructive" });
      return;
    }
    toast({ title: t("files.deleted") });
    setDetail(null);
    setSelectedId(null);
    void reload();
  }

  const tokens = useMemo(
    () => (detail && !editing ? highlight(detail.content, detail.language) : []),
    [detail, editing]
  );

  function renderNode(node: TreeNode, depth: number): React.ReactNode[] {
    const out: React.ReactNode[] = [];
    const dirs = [...node.children.values()].filter((c) => !c.file).sort((a, b) => a.name.localeCompare(b.name));
    const fileNodes = [...node.children.values()].filter((c) => c.file).sort((a, b) => a.name.localeCompare(b.name));
    for (const dir of dirs) {
      const expanded = expandedDirs.has(dir.path);
      out.push(
        <button
          key={dir.path}
          type="button"
          onClick={() =>
            setExpandedDirs((prev) => {
              const next = new Set(prev)
              if (next.has(dir.path)) next.delete(dir.path)
              else next.add(dir.path)
              return next
            })
          }
          className="w-full flex items-center gap-1.5 px-2 py-1.5 hover:bg-zinc-900/60 rounded text-sm text-zinc-300 text-left"
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
        >
          {expanded ? <FolderOpen className="h-3.5 w-3.5 text-emerald-400/80" /> : <Folder className="h-3.5 w-3.5 text-emerald-400/80" />}
          <span className="truncate">{dir.name}</span>
        </button>
      )
      if (expanded) out.push(...renderNode(dir, depth + 1))
    }
    for (const file of fileNodes) {
      const f = file.file!
      const selected = f.id === selectedId
      out.push(
        <button
          key={f.id}
          type="button"
          onClick={() => {
            setSelectedId(f.id)
            setDetail(null)
            setShowVersions(false)
          }}
          className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-sm text-left transition-colors ${
            selected ? "bg-emerald-500/15 text-emerald-200" : "text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-200"
          }`}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
        >
          <FileCode2 className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
          <span className="truncate flex-1">{file.name}</span>
          {f.status === "PROPOSED" && <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />}
          {f.status === "APPROVED" && <Check className="h-3 w-3 text-emerald-400 shrink-0" />}
        </button>
      )
    }
    return out
  }

  return (
    <div className="grid lg:grid-cols-[280px_1fr] gap-4">
      {/* Colonne 1 : arborescence */}
      <Card className="bg-zinc-900/40 border-zinc-800 overflow-hidden">
        <CardHeader className="pb-2 border-b border-zinc-800">
          <CardTitle className="text-sm flex items-center gap-2 text-zinc-200">
            <FileCode2 className="h-4 w-4 text-emerald-400" />
            {t("files.explorer")}
            <Badge variant="outline" className="ml-auto text-[10px] border-zinc-700 text-zinc-400">
              {files.length}
            </Badge>
          </CardTitle>
          <div className="relative mt-2">
            <Search className="h-3.5 w-3.5 text-zinc-600 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("files.search")}
              className="w-full h-8 pl-8 pr-2 rounded-md border border-zinc-800 bg-zinc-950 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
            />
          </div>
        </CardHeader>
        <CardContent className="p-2 max-h-[560px] overflow-y-auto">
          {loading ? (
            <div className="space-y-2 p-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-6 w-full bg-zinc-800/60" />)}</div>
          ) : files.length === 0 ? (
            <div className="text-center py-10 text-zinc-500">
              <FileText className="h-8 w-8 mx-auto mb-2 text-zinc-700" />
              <p className="text-xs">{t("files.empty")}</p>
              <p className="text-[11px] text-zinc-600 mt-1 max-w-[220px] mx-auto">{t("files.emptyDesc")}</p>
            </div>
          ) : (
            renderNode(tree, 0)
          )}
        </CardContent>
      </Card>

      {/* Colonne 2 : contenu */}
      <Card className="bg-zinc-900/40 border-zinc-800 overflow-hidden">
        {detailLoading && !detail ? (
          <CardContent className="p-6">
            <Skeleton className="h-80 w-full bg-zinc-800/60" />
          </CardContent>
        ) : !detail ? (
          <CardContent className="p-0">
            <div className="py-20 text-center text-zinc-500">
              <Eye className="h-10 w-10 mx-auto mb-3 text-zinc-700" />
              <p className="text-sm">{t("files.selectFile")}</p>
            </div>
          </CardContent>
        ) : (
          <>
            <CardHeader className="pb-2 border-b border-zinc-800 bg-zinc-900/60">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <FileCode2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <code className="text-sm text-zinc-100 truncate font-mono">{detail.path}</code>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant="outline" className={`text-[10px] ${LANGUAGE_BADGE[detail.language] ?? "border-zinc-700 text-zinc-400"}`}>
                    {detail.language}
                  </Badge>
                  <Badge variant="outline" className={`text-[10px] ${STATUS_BADGE[detail.status]?.cls ?? "border-zinc-700 text-zinc-400"}`}>
                    {t(STATUS_BADGE[detail.status]?.key as never ?? "files.statusProposed")}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-400">
                    v{detail.version}
                  </Badge>
                  {detail.agentId && (
                    <Badge variant="outline" className="text-[10px] border-violet-500/40 text-violet-300 gap-1">
                      <Bot className="h-2.5 w-2.5" /> agent
                    </Badge>
                  )}
                  <span className="text-[10px] text-zinc-600">{(detail.bytes / 1024).toFixed(1)} Ko</span>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  className={`h-7 text-xs ${editing ? "border-sky-500/50 bg-sky-500/10 text-sky-300" : "border-zinc-700"}`}
                  onClick={() => {
                    setEditing(!editing)
                    setDraft(detail.content)
                  }}
                >
                  <Pencil className="h-3 w-3" />
                  <span className="ml-1">{editing ? t("files.viewMode") : t("files.editMode")}</span>
                </Button>
                {editing && (
                  <>
                    <Button
                      size="sm"
                      className="h-7 text-xs bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-semibold"
                      onClick={save}
                      disabled={saving}
                    >
                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      <span className="ml-1">{t("files.save")}</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => setEditing(false)}
                    >
                      {t("files.cancel")}
                    </Button>
                  </>
                )}
                {!editing && (
                  <>
                    {detail.status === "PROPOSED" && (
                      <>
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-semibold"
                          onClick={() => decide("APPROVE")}
                        >
                          <Check className="h-3 w-3" />
                          <span className="ml-1">{t("files.approve")}</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-red-500/40 text-red-300 hover:bg-red-500/10"
                          onClick={() => decide("REJECT")}
                        >
                          <X className="h-3 w-3" />
                          <span className="ml-1">{t("files.reject")}</span>
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-zinc-400"
                      onClick={() => setShowVersions(!showVersions)}
                    >
                      <History className="h-3 w-3" />
                      <span className="ml-1">{t("files.history")}</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-red-300/70 hover:text-red-300"
                      onClick={remove}
                    >
                      <Trash2 className="h-3 w-3" />
                      <span className="ml-1">{t("files.delete")}</span>
                    </Button>
                  </>
                )}
              </div>
              {showVersions && (
                <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-950 p-2 space-y-1">
                  {detail.versions.map((v) => (
                    <button
                      key={v.version}
                      type="button"
                      onClick={() => (compareVersion === v.version ? setCompareVersion(null) : loadCompare(v.version))}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-zinc-900/60 ${
                        compareVersion === v.version ? "bg-sky-500/10 text-sky-300" : "text-zinc-400"
                      }`}
                    >
                      {v.source === "AGENT" ? <Bot className="h-3 w-3 text-violet-400" /> : <User className="h-3 w-3 text-sky-400" />}
                      <span className="font-mono">v{v.version}</span>
                      <span className="text-zinc-600">{v.source === "AGENT" ? t("files.byAgent") : t("files.byHuman")}</span>
                      <span className="ml-auto text-zinc-600">{formatDate(v.createdAt)}</span>
                    </button>
                  ))}
                </div>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <div className="bg-zinc-950 max-h-[520px] overflow-y-auto">
                {editing ? (
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    spellCheck={false}
                    className="w-full min-h-[480px] bg-transparent p-4 font-mono text-xs text-zinc-200 leading-relaxed focus:outline-none resize-y"
                  />
                ) : compareVersion !== null && compareContent !== null ? (
                  <div className="grid md:grid-cols-2 divide-x divide-zinc-900">
                    <div>
                      <div className="px-4 py-2 text-[10px] text-sky-300 border-b border-zinc-900 bg-sky-500/5">
                        {t("files.version")} v{compareVersion} ({t("files.compareLeft")})
                      </div>
                      <pre className="p-4 font-mono text-xs text-zinc-300 whitespace-pre-wrap break-words">
                        {compareContent}
                      </pre>
                    </div>
                    <div>
                      <div className="px-4 py-2 text-[10px] text-emerald-300 border-b border-zinc-900 bg-emerald-500/5">
                        {t("files.currentVersion")} (v{detail.version})
                      </div>
                      <pre className="p-4 font-mono text-xs text-zinc-300 whitespace-pre-wrap break-words">
                        {detail.content}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <pre className="p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
                    {tokens.map((tk, i) => (
                      <span key={i} className={KIND_CLASS[tk.kind] ?? "text-zinc-200"}>
                        {tk.text}
                      </span>
                    ))}
                  </pre>
                )}
              </div>
              {detail.description && (
                <div className="px-4 py-2 border-t border-zinc-900 text-xs text-zinc-500 flex items-start gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-500/60 shrink-0 mt-0.5" />
                  <span>{detail.description}</span>
                </div>
              )}
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
