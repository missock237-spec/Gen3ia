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
import { Loader2, Bot, ArrowRight, Wrench, Sparkles, Wand2, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const TOOLS = [
  { key: "web_search", label: "Recherche web", desc: "Résultats en direct du web" },
  { key: "page_reader", label: "Lecteur de page", desc: "Lit le contenu d'une URL" },
  { key: "calculator", label: "Calculatrice", desc: "Évaluations mathématiques exactes" },
  { key: "code_runner", label: "Exécuteur de code", desc: "JavaScript sandboxé (sensible)" },
  { key: "knowledge_search", label: "Base de connaissances", desc: "Recherche RAG sur vos documents" },
  { key: "memory_recall", label: "Rappel mémoire", desc: "Leçons et préférences mémorisées" },
  { key: "http_fetch", label: "Requête HTTP", desc: "APIs publiques (sensible)" },
  { key: "datetime", label: "Date et heure", desc: "Horodatage courant" },
];

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
    setTools((t) => (t.includes(key) ? t.filter((x) => x !== key) : [...t, key]));
  }

  /** Pré-remplit le formulaire à partir d'un template (tout reste modifiable). */
  function applyTemplate(t: TemplatePreview) {
    setName(t.name);
    setDescription(t.description);
    setSystemPrompt(""); // Le prompt complet est appliqué à la création ; l'édition manuelle reste libre.
    setPendingTemplate(t);
    setCategory(t.category);
    setTemperature(t.temperature);
    setTools(t.tools);
    toast({
      title: `Template « ${t.name} » chargé`,
      description: "Formulaire pré-rempli — ajustez librement avant de créer, ou cliquez « Créer en 1 clic ».",
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
      if (!res.ok) throw new Error(res.error ?? "Création impossible.");
      toast({ title: "Agent créé depuis le template", description: `« ${res.agent.name} » est prêt — prompt et outils pré-configurés.` });
      router.push(`/agents/${res.agent.id}`);
    } catch (err) {
      toast({
        title: "Échec de création",
        description: err instanceof Error ? err.message : "Erreur inconnue.",
        variant: "destructive",
      });
    } finally {
      setInstantiating(null);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || name.trim().length < 2) {
      toast({ title: "Nom trop court", description: "Donnez un nom d'au moins 2 caractères.", variant: "destructive" });
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
      if (!res.ok) throw new Error(res.error ?? "Création impossible.");
      toast({ title: "Agent créé", description: `« ${name} » est prêt à être testé.` });
      router.push(`/agents/${res.agent.id}`);
    } catch (err) {
      toast({
        title: "Échec de création",
        description: err instanceof Error ? err.message : "Erreur inconnue.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Créer un agent</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Définissez son identité, son moteur et ses outils. Vous pourrez le tester puis le déployer en API.
        </p>
      </div>

      {/* v3.1 — Galerie de templates : déploiement en un clic */}
      {templates.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-zinc-200">Partir d'un template pré-configuré</h2>
            <span className="text-xs text-zinc-500">— 8 profils éprouvés, entièrement modifiables après création</span>
          </div>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {templates.map((t) => (
              <div
                key={t.key}
                className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 flex flex-col hover:border-amber-500/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-sm text-zinc-100">{t.name}</div>
                  <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[9px] shrink-0">
                    {t.category}
                  </Badge>
                </div>
                <p className="text-xs text-zinc-500 mt-1.5 line-clamp-3 flex-1">{t.description}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {t.tools.slice(0, 3).map((tool) => (
                    <span key={tool} className="text-[9px] font-mono text-zinc-600 border border-zinc-800 rounded px-1.5 py-0.5">
                      {tool}
                    </span>
                  ))}
                  {t.tools.length > 3 && (
                    <span className="text-[9px] font-mono text-zinc-600">+{t.tools.length - 3}</span>
                  )}
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold flex-1"
                    disabled={instantiating === t.key}
                    onClick={() => instantiateTemplate(t.key)}
                  >
                    {instantiating === t.key ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Wand2 className="h-3 w-3" />
                    )}
                    <span className="ml-1.5 text-xs">Créer en 1 clic</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 border-zinc-700 text-zinc-400"
                    onClick={() => applyTemplate(t)}
                  >
                    <Eye className="h-3 w-3" />
                    <span className="ml-1.5 text-xs">Pré-remplir</span>
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
              <Bot className="h-4 w-4 text-emerald-400" /> Identité
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">Nom de l'agent *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex. Analyste de marché"
                className="bg-zinc-950 border-zinc-800 focus-visible:ring-emerald-500/40"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description / mission</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ce que fait l'agent, en une phrase"
                className="bg-zinc-950 border-zinc-800 focus-visible:ring-emerald-500/40"
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label htmlFor="category">Catégorie</Label>
                <Input
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Ex. ANALYSE, REDACTION"
                  className="bg-zinc-950 border-zinc-800 focus-visible:ring-emerald-500/40"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="provider">Moteur d'inférence</Label>
                <select
                  id="provider"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="w-full h-9 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                >
                  <option value="auto">Automatique (Model Router)</option>
                  {providers.map((p) => (
                    <option key={p.key} value={p.key} disabled={!p.available}>
                      {p.name} {p.available ? "" : "— non configuré"}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="systemPrompt">Prompt système (instructions de l'agent)</Label>
              <Textarea
                id="systemPrompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Tu es un analyste rigoureux. Tu vérifies tes affirmations avec des sources avant de conclure…"
                className="min-h-[120px] bg-zinc-950 border-zinc-800 focus-visible:ring-emerald-500/40 font-mono text-sm"
              />
              <p className="text-xs text-zinc-500">
                Requis pour le déploiement : un agent publié doit avoir des instructions claires.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Créativité (température) : <span className="font-mono text-emerald-400">{temperature.toFixed(1)}</span></Label>
              <Slider
                value={[temperature]}
                onValueChange={([v]) => setTemperature(v)}
                min={0}
                max={1.5}
                step={0.1}
                className="[&_[role=slider]]:border-emerald-500"
              />
              <p className="text-xs text-zinc-500">0 = déterministe · 1.5 = très créatif</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/40 border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="h-4 w-4 text-emerald-400" /> Outils accessibles
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-3">
              {TOOLS.map((tool) => {
                const enabled = tools.includes(tool.key)
                return (
                  <div
                    role="checkbox"
                    aria-checked={enabled}
                    tabIndex={0}
                    key={tool.key}
                    onClick={() => toggleTool(tool.key)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        toggleTool(tool.key)
                      }
                    }}
                    className={`flex items-start justify-between gap-3 rounded-lg border p-3.5 text-left transition-colors cursor-pointer ${
                      enabled
                        ? "border-emerald-500/40 bg-emerald-500/5"
                        : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
                    }`}
                  >
                    <div>
                      <div className="text-sm font-medium text-zinc-200">{tool.label}</div>
                      <div className="text-xs text-zinc-500 mt-0.5">{tool.desc}</div>
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
              <>Créer l'agent <ArrowRight className="h-4 w-4 ml-2" /></>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
