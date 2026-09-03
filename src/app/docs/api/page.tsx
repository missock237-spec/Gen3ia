"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n";
import {
  Loader2, Play, ArrowLeft, Braces, KeyRound, Download, ChevronDown, ChevronRight, Lock,
} from "lucide-react";

/**
 * Swagger UI GEN3IA (v3.6 — DX) — documentation API interactive :
 *  - rend la spécification OpenAPI 3.1 réelle servie par /api/openapi.json ;
 *  - « Essayer » exécute la VRAIE requête fetch avec la clé API saisie
 *    (la clé ne quitte jamais le navigateur) ;
 *  - zéro dépendance externe (pas de CDN) — fonctionne hors ligne.
 */

interface OpenApiSpec {
  info: { title: string; version: string; description?: string }
  servers?: Array<{ url: string }>
  paths: Record<
    string,
    Partial<Record<"get" | "post" | "patch" | "delete", Operation>>
  >
  components?: { schemas?: Record<string, unknown> }
}

interface Operation {
  tags?: string[]
  summary?: string
  description?: string
  parameters?: Array<{ name: string; in: string; required?: boolean; description?: string; schema?: { type?: string; default?: unknown } }>
  requestBody?: { content?: Record<string, { schema?: unknown }> }
  responses?: Record<string, { description?: string }>
}

const METHOD_COLORS: Record<string, string> = {
  get: "bg-sky-500/15 text-sky-300 border-sky-500/40",
  post: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  patch: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  delete: "bg-rose-500/15 text-rose-300 border-rose-500/40",
}

/** Exemple de corps généré depuis le schéma (résumé lisible). */
function schemaToExample(schema: unknown): string {
  if (!schema || typeof schema !== "object") return "{}"
  const s = schema as { $ref?: string; properties?: Record<string, unknown>; required?: string[]; type?: string; enum?: unknown[] }
  if (s.$ref) {
    // Référence : rend un squelette {} — l'utilisateur complète.
    return "{}"
  }
  if (s.type === "object" && s.properties) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(s.properties)) {
      const prop = v as { type?: string; enum?: unknown[]; default?: unknown; nullable?: boolean; minLength?: number }
      if (prop.enum) out[k] = prop.enum[0]
      else if (prop.default !== undefined) out[k] = prop.default
      else if (prop.type === "string") out[k] = prop.minLength && prop.minLength > 5 ? "Une demande suffisamment détaillée pour l'agent" : "texte"
      else if (prop.type === "integer" || prop.type === "number") out[k] = 1
      else if (prop.type === "boolean") out[k] = false
      else if (prop.type === "array") out[k] = []
      else out[k] = null
    }
    // Priorité aux champs requis (remplissage utile).
    return JSON.stringify(out, null, 2)
  }
  return "{}"
}

export default function ApiDocsPage() {
  const { t } = useI18n();
  const [spec, setSpec] = useState<OpenApiSpec | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [openPaths, setOpenPaths] = useState<Record<string, boolean>>({});
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [pathParams, setPathParams] = useState<Record<string, Record<string, string>>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, { status: number; durationMs: number; body: string }>>({});

  useEffect(() => {
    fetch("/api/openapi.json")
      .then((r) => r.json())
      .then((doc: OpenApiSpec) => setSpec(doc))
      .catch(() => setLoadError("Impossible de charger la spécification."));
  }, []);

  const entries = useMemo(() => {
    if (!spec) return []
    return Object.entries(spec.paths).flatMap(([path, ops]) =>
      Object.entries(ops)
        .filter(([method]) => ["get", "post", "patch", "delete"].includes(method))
        .map(([method, op]) => ({ path, method, op }))
    )
  }, [spec])

  const grouped = useMemo(() => {
    const map = new Map<string, typeof entries>()
    for (const e of entries) {
      const tag = e.op.tags?.[0] ?? "Autres"
      if (!map.has(tag)) map.set(tag, [])
      map.get(tag)!.push(e)
    }
    return [...map.entries()]
  }, [entries])

  const runRequest = useCallback(
    async (key: string, path: string, method: string, op: Operation) => {
      let url = path;
      const params = pathParams[key] ?? {}
      for (const [name, value] of Object.entries(params)) {
        url = url.replace(`{${name}}`, encodeURIComponent(value));
      }
      // Paramètres de requête (default non nul seulement).
      const search = new URLSearchParams();
      for (const p of op.parameters ?? []) {
        if (p.in === "query" && p.schema?.default !== undefined && p.schema.default !== null) {
          search.set(p.name, String(p.schema.default));
        }
      }
      const qs = search.toString();
      const started = Date.now();
      setRunning(key);
      try {
        const res = await fetch(url + (qs ? `?${qs}` : ""), {
          method: method.toUpperCase(),
          headers: {
            ...(method !== "get" ? { "Content-Type": "application/json" } : {}),
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: method !== "get" && bodies[key] ? bodies[key] : undefined,
        });
        const text = await res.text();
        let pretty = text
        try {
          pretty = JSON.stringify(JSON.parse(text), null, 2)
        } catch {
          /* réponse non JSON */
        }
        setResponses((r) => ({ ...r, [key]: { status: res.status, durationMs: Date.now() - started, body: pretty } }));
      } catch {
        setResponses((r) => ({ ...r, [key]: { status: 0, durationMs: Date.now() - started, body: t("docs.api.executeError") } }));
      } finally {
        setRunning(null);
      }
    },
    [apiKey, bodies, pathParams, t]
  )

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* En-tête */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Braces className="h-6 w-6 text-emerald-400" />
              {t("docs.api.title")}
              {spec && <span className="text-xs font-mono text-zinc-500 mt-1">v{spec.info.version} · OpenAPI 3.1</span>}
            </h1>
            <p className="text-sm text-zinc-500 mt-1">{t("docs.api.subtitle")}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild className="border-zinc-800 bg-zinc-900/40">
              <Link href="/"><ArrowLeft className="h-4 w-4 mr-2" />{t("docs.api.backHome")}</Link>
            </Button>
            <Button variant="outline" asChild className="border-zinc-800 bg-zinc-900/40">
              <a href="/api/openapi.json" download="gen3ia-openapi.json"><Download className="h-4 w-4 mr-2" />{t("docs.api.download")}</a>
            </Button>
          </div>
        </div>

        {/* Clé API */}
        <Card className="bg-zinc-900/40 border-zinc-800">
          <CardContent className="pt-6 space-y-2">
            <Label className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-emerald-400" />{t("docs.api.apiKey")}</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="g3ia_live_…"
              className="bg-zinc-950 border-zinc-800 font-mono"
            />
            <p className="text-[11px] text-zinc-500">{t("docs.api.apiKeyHint")} — {t("docs.api.auth")}</p>
          </CardContent>
        </Card>

        {loadError && (
          <Card className="bg-rose-950/30 border-rose-900">
            <CardContent className="pt-6 text-sm text-rose-300">{loadError}</CardContent>
          </Card>
        )}

        {!spec && !loadError && (
          <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full bg-zinc-900/40" />)}</div>
        )}

        {/* Endpoints groupés par tag */}
        {grouped.map(([tag, ops]) => (
          <div key={tag} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-emerald-400">{tag}</h2>
            {ops.map(({ path, method, op }) => {
              const key = `${method}:${path}`;
              const open = openPaths[key] ?? false;
              const response = responses[key];
              const pathParamsList = (op.parameters ?? []).filter((p) => p.in === "path");
              return (
                <Card key={key} className="bg-zinc-900/40 border-zinc-800">
                  <CardHeader
                    className="cursor-pointer select-none py-4"
                    onClick={() => setOpenPaths((o) => ({ ...o, [key]: !o[key] }))}
                  >
                    <CardTitle className="flex items-center gap-3 text-sm font-mono">
                      <span className={`px-2 py-0.5 rounded border text-[11px] font-bold uppercase ${METHOD_COLORS[method] ?? ""}`}>
                        {method}
                      </span>
                      <span className="truncate">{path}</span>
                      <span className="ml-auto text-xs font-sans text-zinc-500 truncate max-w-[40%]">{op.summary}</span>
                      {open ? <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" /> : <ChevronRight className="h-4 w-4 text-zinc-500 shrink-0" />}
                    </CardTitle>
                  </CardHeader>
                  {open && (
                    <CardContent className="space-y-4 pt-0">
                      {op.description && (
                        <p className="text-sm text-zinc-400 whitespace-pre-line">{op.description}</p>
                      )}

                      {pathParamsList.length > 0 && (
                        <div className="space-y-2">
                          <Label className="text-xs uppercase tracking-wide text-zinc-500">{t("docs.api.pathParams")}</Label>
                          {pathParamsList.map((p) => (
                            <div key={p.name} className="grid grid-cols-[1fr_2fr] gap-2 items-center">
                              <span className="font-mono text-xs text-amber-300">{p.name}{p.required ? " *" : ""}</span>
                              <Input
                                value={pathParams[key]?.[p.name] ?? ""}
                                onChange={(e) => setPathParams((s) => ({ ...s, [key]: { ...(s[key] ?? {}), [p.name]: e.target.value } }))}
                                placeholder={p.description ?? ""}
                                className="bg-zinc-950 border-zinc-800 h-8 text-xs font-mono"
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {method !== "get" && (
                        <div className="space-y-2">
                          <Label className="text-xs uppercase tracking-wide text-zinc-500">{t("docs.api.requestBody")}</Label>
                          <Textarea
                            value={bodies[key] ?? schemaToExample(op.requestBody?.content?.["application/json"]?.schema)}
                            onChange={(e) => setBodies((b) => ({ ...b, [key]: e.target.value }))}
                            className="min-h-[120px] bg-zinc-950 border-zinc-800 font-mono text-xs"
                          />
                        </div>
                      )}

                      <div className="flex items-center gap-3">
                        <Button
                          onClick={() => runRequest(key, path, method, op)}
                          disabled={running !== null || !apiKey}
                          className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-semibold"
                        >
                          {running === key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                          <span className="ml-2">{running === key ? t("docs.api.sending") : t("docs.api.try")}</span>
                        </Button>
                        {!apiKey && <span className="text-xs text-zinc-500 flex items-center gap-1"><Lock className="h-3 w-3" />{t("docs.api.noKey")}</span>}
                      </div>

                      {response && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-3 text-xs">
                            <span className="text-zinc-500 uppercase tracking-wide">{t("docs.api.response")}</span>
                            <span className={`font-mono font-bold ${response.status >= 200 && response.status < 300 ? "text-emerald-400" : "text-rose-400"}`}>
                              {t("docs.api.status")} {response.status}
                            </span>
                            <span className="font-mono text-zinc-500">{t("docs.api.duration")} {response.durationMs} ms</span>
                          </div>
                          <pre className="max-h-80 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs font-mono whitespace-pre-wrap">
                            {response.body}
                          </pre>
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        ))}

        {/* Schémas */}
        {spec?.components?.schemas && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-emerald-400">{t("docs.api.models")}</h2>
            <Card className="bg-zinc-900/40 border-zinc-800">
              <CardContent className="pt-6">
                <pre className="max-h-96 overflow-auto text-xs font-mono text-zinc-400">
                  {JSON.stringify(spec.components.schemas, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </div>
        )}

        <p className="text-[11px] text-zinc-600 text-center pb-6">{t("docs.api.envelope")}</p>
      </div>
    </div>
  );
}
