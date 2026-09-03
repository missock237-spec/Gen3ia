"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/app/status-badge";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { renderRich } from "@/lib/i18n/rich";
import { apiPost, apiPatch, formatCredits, usePolling } from "@/lib/client/hooks";
import {
  Loader2, Send, Save, Rocket, Copy, Check, MessageSquare, Wrench, Wrench as WrenchIcon,
  KeyRound, Terminal, ExternalLink, Store,
} from "lucide-react";

interface AgentDetail {
  id: string
  name: string
  slug: string
  description: string | null
  systemPrompt: string | null
  provider: string
  model: string
  temperature: number
  maxTokens: number
  status: string
  visibility: string
  category: string | null
  config: string | null
  stats: string | null
  createdAt: string
  _count: { tasks: number; reviews: number }
}

interface ChatMsg { role: "user" | "assistant"; content: string }

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useI18n();
  const { data, loading, reload } = usePolling<{ ok: boolean; agent: AgentDetail }>(`/api/agents/${id}`);
  const agent = data?.agent;

  // --- Formulaire constructeur ---
  const [form, setForm] = useState({ name: "", description: "", systemPrompt: "", category: "", temperature: 0.7 });
  const [tools, setTools] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (agent && !initialized) {
      setForm({
        name: agent.name,
        description: agent.description ?? "",
        systemPrompt: agent.systemPrompt ?? "",
        category: agent.category ?? "",
        temperature: agent.temperature,
      })
      setTools(agent.config ? JSON.parse(agent.config).tools ?? [] : [])
      setInitialized(true)
    }
  }, [agent, initialized])

  async function saveAgent() {
    if (!agent) return
    setSaving(true)
    try {
      const res = await apiPatch(`/api/agents/${agent.id}`, {
        name: form.name,
        description: form.description || null,
        systemPrompt: form.systemPrompt || null,
        category: form.category || null,
        temperature: form.temperature,
        tools,
      })
      if (!res.ok) throw new Error(res.error)
      toast({ title: t("agents.saved.title"), description: t("agents.saved.desc") })
      await reload()
    } catch (err) {
      toast({ title: t("agents.errors.saveFailed"), description: err instanceof Error ? err.message : "", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  // --- Console de test ---
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState("")
  const [testing, setTesting] = useState(false)
  const [usage, setUsage] = useState<{ tokensIn: number; tokensOut: number; credits: number } | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function sendTest() {
    if (!agent || !input.trim() || testing) return
    const message = input.trim()
    setInput("")
    const history = messages.slice(-10)
    setMessages((m) => [...m, { role: "user", content: message }, { role: "assistant", content: "" }])
    setTesting(true)
    try {
      const res = await apiPost<{ answer: string; tokensIn: number; tokensOut: number; credits: number }>(
        `/api/agents/${agent.id}/test`,
        { message, history }
      )
      if (!res.ok) throw new Error(res.error)
      setMessages((m) => {
        const copy = [...m]
        copy[copy.length - 1] = { role: "assistant", content: res.answer }
        return copy
      })
      setUsage({ tokensIn: res.tokensIn, tokensOut: res.tokensOut, credits: res.credits })
    } catch (err) {
      setMessages((m) => {
        const copy = [...m]
        copy[copy.length - 1] = {
          role: "assistant",
          content: `⚠️ ${err instanceof Error ? err.message : t("agents.errors.testError")}`,
        }
        return copy
      })
    } finally {
      setTesting(false)
    }
  }

  // --- Déploiement ---
  const [deploying, setDeploying] = useState(false)
  const [deployResult, setDeployResult] = useState<{
    endpoint: string
    apiKey: { secret: string; prefix: string } | null
    docs: { chat: string; curl: string }
  } | null>(null)
  const [copied, setCopied] = useState(false)

  async function deploy() {
    if (!agent) return
    setDeploying(true)
    try {
      const res = await apiPost<typeof deployResult & { ok: boolean }>(`/api/agents/${agent.id}/deploy`, {
        generateKey: true,
        keyName: t("agents.deploy.keyName", { name: agent.name }),
      })
      if (!res.ok) throw new Error(res.error)
      setDeployResult(res)
      await reload()
      toast({ title: t("agents.deploy.deployedTitle"), description: t("agents.deploy.deployedDesc") })
    } catch (err) {
      toast({ title: t("agents.errors.deployFailed"), description: err instanceof Error ? err.message : "", variant: "destructive" })
    } finally {
      setDeploying(false)
    }
  }

  async function publishMarketplace() {
    if (!agent) return
    const res = await apiPost("/api/marketplace", { agentId: agent.id, action: agent.visibility === "MARKETPLACE" ? "unpublish" : "publish" })
    if (!res.ok) {
      toast({ title: t("agents.errors.actionFailed"), description: res.error, variant: "destructive" })
      return
    }
    await reload()
    toast({
      title: agent.visibility === "MARKETPLACE" ? t("agents.marketplace.unpublish") : t("agents.marketplace.publish"),
    })
  }

  if (loading || !agent) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64 bg-zinc-800/60" />
        <Skeleton className="h-96 w-full bg-zinc-800/60" />
      </div>
    )
  }

  const stats = agent.stats ? JSON.parse(agent.stats) : null
  const TOOL_KEYS = ["web_search", "page_reader", "calculator", "code_runner", "knowledge_search", "memory_recall", "http_fetch", "datetime"]
  const TOOL_LABELS: Record<string, string> = {
    web_search: t("agents.toolShort.web_search"), page_reader: t("agents.toolShort.page_reader"),
    calculator: t("agents.toolShort.calculator"), code_runner: t("agents.toolShort.code_runner"),
    knowledge_search: t("agents.toolShort.knowledge_search"), memory_recall: t("agents.toolShort.memory_recall"),
    http_fetch: t("agents.toolShort.http_fetch"), datetime: t("agents.toolShort.datetime"),
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight truncate">{agent.name}</h1>
            <StatusBadge status={agent.status} />
          </div>
          <p className="text-sm text-zinc-500 font-mono mt-1">/{agent.slug} · {t("agents.tasksCount", { count: agent._count.tasks })}</p>
        </div>
        <Button
          onClick={saveAgent}
          disabled={saving}
          className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-semibold"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          <span className="ml-2">{t("common.save")}</span>
        </Button>
      </div>

      {stats && stats.runs > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="bg-zinc-900/40 border-zinc-800 py-3">
            <CardContent className="px-4 text-center">
              <div className="text-xl font-bold">{stats.runs}</div>
              <div className="text-[11px] text-zinc-500 mt-0.5">{t("agents.stats.runs")}</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/40 border-zinc-800 py-3">
            <CardContent className="px-4 text-center">
              <div className="text-xl font-bold text-emerald-400">{stats.runs > 0 ? Math.round((stats.success / stats.runs) * 100) : 0}%</div>
              <div className="text-[11px] text-zinc-500 mt-0.5">{t("agents.stats.successRate")}</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/40 border-zinc-800 py-3">
            <CardContent className="px-4 text-center">
              <div className="text-xl font-bold">{formatCredits(stats.credits ?? 0)}</div>
              <div className="text-[11px] text-zinc-500 mt-0.5">{t("agents.stats.credits")}</div>
            </CardContent>
          </Card>
          <Card className="bg-zinc-900/40 border-zinc-800 py-3">
            <CardContent className="px-4 text-center">
              <div className="text-xl font-bold">{((stats.tokens ?? 0) / 1000).toFixed(1)}k</div>
              <div className="text-[11px] text-zinc-500 mt-0.5">{t("agents.stats.tokens")}</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="builder" className="w-full">
        <TabsList className="bg-zinc-900/60 border border-zinc-800 w-full sm:w-auto">
          <TabsTrigger value="builder" className="data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-300 flex-1 sm:flex-none">{t("agents.tabs.builder")}</TabsTrigger>
          <TabsTrigger value="test" className="data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-300 flex-1 sm:flex-none">
            <MessageSquare className="h-3.5 w-3.5 mr-1.5" />{t("agents.tabs.test")}
          </TabsTrigger>
          <TabsTrigger value="deploy" className="data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-300 flex-1 sm:flex-none">
            <Rocket className="h-3.5 w-3.5 mr-1.5" />{t("agents.tabs.deploy")}
          </TabsTrigger>
        </TabsList>

        {/* ---- CONSTRUCTEUR ---- */}
        <TabsContent value="builder" className="space-y-5">
          <Card className="bg-zinc-900/40 border-zinc-800">
            <CardContent className="space-y-5 pt-6">
              <div className="grid sm:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label>{t("common.name")}</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-zinc-950 border-zinc-800" />
                </div>
                <div className="space-y-2">
                  <Label>{t("agents.form.category")}</Label>
                  <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="bg-zinc-950 border-zinc-800" placeholder={t("agents.detail.categoryPlaceholder")} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("common.description")}</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="bg-zinc-950 border-zinc-800" />
              </div>
              <div className="space-y-2">
                <Label>{t("agents.detail.systemPrompt")}</Label>
                <Textarea
                  value={form.systemPrompt}
                  onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
                  className="min-h-[140px] bg-zinc-950 border-zinc-800 font-mono text-sm"
                  placeholder={t("agents.detail.systemPromptPlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("agents.detail.temperature")} <span className="font-mono text-emerald-400">{form.temperature.toFixed(1)}</span></Label>
                <Slider value={[form.temperature]} onValueChange={([v]) => setForm({ ...form, temperature: v })} min={0} max={1.5} step={0.1} />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900/40 border-zinc-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Wrench className="h-4 w-4 text-emerald-400" />{t("agents.detail.tools")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {TOOL_KEYS.map((key) => {
                  const enabled = tools.includes(key)
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setTools((current) => (enabled ? current.filter((x) => x !== key) : [...current, key]))}
                      className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                        enabled
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                          : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-zinc-700"
                      }`}
                    >
                      {TOOL_LABELS[key]}
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- TEST ---- */}
        <TabsContent value="test">
          <Card className="bg-zinc-900/40 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2"><Terminal className="h-4 w-4 text-emerald-400" />{t("agents.test.console")}</span>
                {usage && (
                  <span className="text-xs font-mono text-zinc-500 normal-weight">
                    {t("agents.test.usage", { in: usage.tokensIn, out: usage.tokensOut, credits: formatCredits(usage.credits) })}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 h-[420px] overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-600">
                    <MessageSquare className="h-8 w-8 mb-3" />
                    <p className="text-sm">{t("agents.test.empty")}</p>
                    <p className="text-xs mt-1">{t("agents.test.emptyHint")}</p>
                  </div>
                ) : (
                  messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                          m.role === "user"
                            ? "bg-emerald-500 text-zinc-950 font-medium"
                            : "bg-zinc-900 border border-zinc-800 text-zinc-200"
                        }`}
                      >
                        {m.content === "" ? (
                          <span className="flex items-center gap-2 text-zinc-500">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("agents.test.generating")}
                          </span>
                        ) : (
                          m.content
                        )}
                      </div>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="mt-4 flex gap-2">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      void sendTest()
                    }
                  }}
                  placeholder={t("agents.test.inputPlaceholder")}
                  className="bg-zinc-950 border-zinc-800 focus-visible:ring-emerald-500/40"
                  disabled={testing}
                />
                <Button onClick={sendTest} disabled={testing || !input.trim()} className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- DÉPLOIEMENT ---- */}
        <TabsContent value="deploy" className="space-y-5">
          <Card className="bg-zinc-900/40 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Rocket className="h-4 w-4 text-emerald-400" />
                {t("agents.deploy.title")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {agent.status !== "PUBLISHED" ? (
                <>
                  <p className="text-sm text-zinc-400">
                    {renderRich(t("agents.deploy.desc"))}
                  </p>
                  {!agent.systemPrompt && (
                    <p className="text-xs text-amber-400 border border-amber-500/30 bg-amber-500/5 rounded-lg p-3">
                      {t("agents.deploy.noPromptWarning")}
                    </p>
                  )}
                  <Button
                    onClick={deploy}
                    disabled={deploying || !agent.systemPrompt}
                    className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-semibold h-11 px-6"
                  >
                    {deploying ? <Loader2 className="h-5 w-5 animate-spin" /> : <Rocket className="h-5 w-5" />}
                    <span className="ml-2">{t("agents.deploy.deploy")}</span>
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-sm text-emerald-400">
                    <Check className="h-4 w-4" /> {t("agents.deploy.publishedActive")}
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs space-y-1 overflow-x-auto">
                    <div className="text-zinc-500">{t("agents.deploy.endpointComment")}</div>
                    <div className="text-emerald-300">{deployResult?.endpoint ?? `${window.location.origin}/api/v1`}</div>
                    <div className="text-zinc-500 mt-3">{t("agents.deploy.agentComment")}</div>
                    <div className="text-zinc-300">agent_slug = "{agent.slug}"</div>
                  </div>
                  {deployResult?.apiKey && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-amber-300 font-semibold flex items-center gap-1.5">
                          <KeyRound className="h-3.5 w-3.5" /> {t("agents.deploy.apiKeyTitle")}
                        </div>
                        <Button
                          size="sm" variant="outline"
                          className="h-7 border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                          onClick={() => {
                            void navigator.clipboard.writeText(deployResult.apiKey!.secret)
                            setCopied(true)
                            setTimeout(() => setCopied(false), 2000)
                          }}
                        >
                          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          <span className="ml-1.5 text-xs">{copied ? t("agents.deploy.copied") : t("agents.deploy.copy")}</span>
                        </Button>
                      </div>
                      <code className="block font-mono text-xs text-amber-200 break-all">{deployResult.apiKey.secret}</code>
                      <p className="text-[11px] text-zinc-500">
                        {t("agents.deploy.apiKeyHint")}
                      </p>
                    </div>
                  )}
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 overflow-x-auto">
                    <div className="text-xs text-zinc-500 mb-2 font-mono">{t("agents.deploy.curlComment")}</div>
                    <code className="text-[11px] text-zinc-300 whitespace-pre-wrap break-all">{deployResult?.docs.curl}</code>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button onClick={deploy} disabled={deploying} variant="outline" className="border-zinc-700 text-zinc-300">
                      {deploying ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                      <span className="ml-2">{t("agents.deploy.regenerateKey")}</span>
                    </Button>
                    <Link href="/sdk">
                      <Button variant="outline" className="border-zinc-700 text-zinc-300">
                        <ExternalLink className="h-4 w-4" /><span className="ml-2">{t("agents.deploy.sdkButton")}</span>
                      </Button>
                    </Link>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="bg-zinc-900/40 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Store className="h-4 w-4 text-emerald-400" />{t("agents.marketplace.title")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-zinc-400 mb-4">
                {t("agents.marketplace.desc")}
              </p>
              <Button
                onClick={publishMarketplace}
                disabled={agent.status !== "PUBLISHED"}
                variant={agent.visibility === "MARKETPLACE" ? "outline" : "default"}
                className={
                  agent.visibility === "MARKETPLACE"
                    ? "border-zinc-700 text-zinc-300"
                    : "bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
                }
              >
                <Store className="h-4 w-4" />
                <span className="ml-2">
                  {agent.visibility === "MARKETPLACE" ? t("agents.marketplace.unpublish") : t("agents.marketplace.publish")}
                </span>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
