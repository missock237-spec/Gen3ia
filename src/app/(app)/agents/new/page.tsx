"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { apiPost } from "@/lib/client/hooks";
import { usePolling } from "@/lib/client/hooks";
import { useI18n } from "@/lib/i18n";
import { Loader2, Bot, ArrowRight, Wrench, Sparkles, Wand2, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const TOOL_KEYS = [
  "web_search", "page_reader", "calculator", "code_runner",
  "knowledge_search", "memory_recall", "http_fetch", "datetime",
] as const;

interface TemplatePreview {
  key: string
  name: string
  category: string
  description: string
  tools: string[]
  temperature: number
  tags: string[]
  systemPromptPreview: string
}

export default function NewAgentPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useI18n();
  const { data: providersData } = usePolling<{ ok: boolean; providers: { key: string; name: string; available: boolean }[] }>("/api/auth/me");
  const providers = providersData?.providers ?? [];
  // v3.1 — galerie de templates pré-configurés.
  const { data: templatesData } = usePolling<{ ok: boolean; templates: TemplatePreview[] }>("/api/agents/templates");
  const templates = templatesData?.templates ?? [];
  const [instantiating, setInstantiating] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [category, setCategory] = useState("");
  const [provider, setProvider] = useState("auto");
  const [temperature, setTemperature] = useState(0.7);
  const [tools, setTools] = useState<string[]>(["web_search", "knowledge_search", "memory_recall"]);

  function toggleTool(key: string) {
    setTools((current) => (current.includes(key) ? current.filter((x) => x !== key) : [...current, key]));
  }

  /** Pré-remplit le formulaire à partir d'un template (tout reste modifiable). */
  function applyTemplate(tpl: TemplatePreview) {
    setName(tpl.name);
    setDescription(tpl.description);
    setSystemPrompt(""); // Le prompt complet est appliqué à la création ; l'édition manuelle reste libre.
    setPendingTemplate(tpl);
    setCategory(tpl.category);
    setTemperature(tpl.temperature);
    setTools(tpl.tools);
    toast({
      title: t("agents.templates.loadedTitle", { name: tpl.name }),
      description: t("agents.templates.loadedDesc"),
    });
  }

  const [pendingTemplate, setPendingTemplate] = useState<TemplatePreview | null>(null);

  /** Création directe depuis le template (prompt système complet inclus). */
  async function instantiateTemplate(key: string) {
    setInstantiating(key);
    try {
      const res = await apiPost<{ agent: { id: string; name: string } }>("/api/agents/templates", {
        templateKey: key,
      });
      if (!res.ok) throw new Error(res.error ?? t("agents.errors.create"));
      toast({ title: t("agents.instantiated.title"), description: t("agents.instantiated.desc", { name: res.agent.name }) });
      router.push(`/agents/${res.agent.id}`);
    } catch (err) {
      toast({
        title: t("agents.errors.createFailed"),
        description: err instanceof Error ? err.message : t("agents.errors.unknown"),
        variant: "destructive",
      });
    } finally {
      setInstantiating(null);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || name.trim().length < 2) {
      toast({ title: t("agents.errors.nameShort"), description: t("agents.errors.nameShortDesc"), variant: "destructive" });
      return;
    }
    // Template sélectionné sans édition manuelle → création directe via l'API
    // dédiée (prompt système complet du template conservé).
    if (pendingTemplate && !systemPrompt.trim() && name.trim() === pendingTemplate.name) {
      await instantiateTemplate(pendingTemplate.key);
      return;
    }
    setLoading(true);
    try {
      const res = await apiPost<{ agent: { id: string } }>("/api/agents", {
        name,
        description: description || undefined,
        systemPrompt: systemPrompt || undefined,
        category: category || undefined,
        provider,
        temperature,
        tools,
      });
      if (!res.ok) throw new Error(res.error ?? t("agents.errors.create"));
      toast({ title: t("agents.created.title"), description: t("agents.created.desc", { name }) });
      router.push(`/agents/${res.agent.id}`);
    } catch (err) {
      toast({
        title: t("agents.errors.createFailed"),
        description: err instanceof Error ? err.message : t("agents.errors.unknown"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("agents.createAgent")}</h1>
        <p className="text-sm text-zinc-400 mt-1">
          {t("agents.new.subtitle")}
        </p>
      </div>

      {/* v3.1 — Galerie de templates : déploiement en un clic */}
      {templates.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-zinc-200">{t("agents.templates.title")}</h2>
            <span className="text-xs text-zinc-500">{t("agents.templates.subtitle")}</span>
          </div>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {templates.map((tpl) => (
              <div
                key={tpl.key}
                className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 flex flex-col hover:border-amber-500/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-sm text-zinc-100">{tpl.name}</div>
                  <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[9px] shrink-0">
                    {tpl.category}
                  </Badge>
                </div>
                <p className="text-xs text-zinc-500 mt-1.5 line-clamp-3 flex-1">{tpl.description}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {tpl.tools.slice(0, 3).map((tool) => (
                    <span key={tool} className="text-[9px] font-mono text-zinc-600 border border-zinc-800 rounded px-1.5 py-0.5">
                      {tool}
                    </span>
                  ))}
                  {tpl.tools.length > 3 && (
                    <span className="text-[9px] font-mono text-zinc-600">+{tpl.tools.length - 3}</span>
                  )}
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold flex-1"
                    disabled={instantiating === tpl.key}
                    onClick={() => instantiateTemplate(tpl.key)}
                  >
                    {instantiating === tpl.key ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Wand2 className="h-3 w-3" />
                    )}
                    <span className="ml-1.5 text-xs">{t("agents.templates.instantiate")}</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 border-zinc-700 text-zinc-400"
                    onClick={() => applyTemplate(tpl)}
                  >
                    <Eye className="h-3 w-3" />
                    <span className="ml-1.5 text-xs">{t("agents.templates.prefill")}</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-6">
        <Card className="bg-zinc-900/40 border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4 text-emerald-400" /> {t("agents.form.identity")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">{t("agents.form.name")}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("agents.form.namePlaceholder")}
                className="bg-zinc-950 border-zinc-800 focus-visible:ring-emerald-500/40"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{t("agents.form.description")}</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("agents.form.descriptionPlaceholder")}
                className="bg-zinc-950 border-zinc-800 focus-visible:ring-emerald-500/40"
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label htmlFor="category">{t("agents.form.category")}</Label>
                <Input
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder={t("agents.form.categoryPlaceholder")}
                  className="bg-zinc-950 border-zinc-800 focus-visible:ring-emerald-500/40"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="provider">{t("agents.form.provider")}</Label>
                <select
                  id="provider"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="w-full h-9 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                >
                  <option value="auto">{t("agents.form.providerAuto")}</option>
                  {providers.map((p) => (
                    <option key={p.key} value={p.key} disabled={!p.available}>
                      {p.name} {p.available ? "" : t("agents.form.providerUnavailable")}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="systemPrompt">{t("agents.form.systemPrompt")}</Label>
              <Textarea
                id="systemPrompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder={t("agents.form.systemPromptPlaceholder")}
                className="min-h-[120px] bg-zinc-950 border-zinc-800 focus-visible:ring-emerald-500/40 font-mono text-sm"
              />
              <p className="text-xs text-zinc-500">
                {t("agents.form.systemPromptHint")}
              </p>
            </div>
            <div className="space-y-2">
              <Label>{t("agents.form.creativity")} <span className="font-mono text-emerald-400">{temperature.toFixed(1)}</span></Label>
              <Slider
                value={[temperature]}
                onValueChange={([v]) => setTemperature(v)}
                min={0}
                max={1.5}
                step={0.1}
                className="[&_[role=slider]]:border-emerald-500"
              />
              <p className="text-xs text-zinc-500">{t("agents.form.temperatureHint")}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/40 border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="h-4 w-4 text-emerald-400" /> {t("agents.form.tools")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-3">
              {TOOL_KEYS.map((toolKey) => {
                const enabled = tools.includes(toolKey)
                return (
                  <div
                    role="checkbox"
                    aria-checked={enabled}
                    aria-label={t(`agents.tools.${toolKey}.label`)}
                    tabIndex={0}
                    key={toolKey}
                    onClick={() => toggleTool(toolKey)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        toggleTool(toolKey)
                      }
                    }}
                    className={`flex items-start justify-between gap-3 rounded-lg border p-3.5 text-left transition-colors cursor-pointer ${
                      enabled
                        ? "border-emerald-500/40 bg-emerald-500/5"
                        : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
                    }`}
                  >
                    <div>
                      <div className="text-sm font-medium text-zinc-200">{t(`agents.tools.${toolKey}.label`)}</div>
                      <div className="text-xs text-zinc-500 mt-0.5">{t(`agents.tools.${toolKey}.desc`)}</div>
                    </div>
                    <span
                      aria-hidden
                      className={`h-5 w-9 shrink-0 rounded-full border transition-colors relative ${
                        enabled ? "bg-emerald-500 border-emerald-500" : "bg-zinc-800 border-zinc-700"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                          enabled ? "left-[1.125rem]" : "left-0.5"
                        }`}
                      />
                    </span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button
            type="submit"
            disabled={loading}
            className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-semibold h-11 px-6"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
              <>{t("agents.form.submit")} <ArrowRight className="h-4 w-4 ml-2" /></>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
