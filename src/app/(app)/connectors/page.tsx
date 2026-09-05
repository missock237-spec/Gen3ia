"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { renderRich } from "@/lib/i18n/rich";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import {
  Plug,
  PlugZap,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  ExternalLink,
  Trash2,
  PlayCircle,
  Loader2,
  KeyRound,
  Info,
} from "lucide-react";
import { CatalogSection } from "@/components/connectors/catalog-section";
import { ComposioCard } from "@/components/connectors/composio-card";
import { GatewaySection } from "@/components/connectors/gateway-section";

interface ActionParamView {
  name: string;
  type: string;
  description: string;
  required: boolean;
  in: string;
  enum?: string[];
}

interface AppView {
  slug: string;
  name: string;
  description: string;
  category: string;
  logo: string;
  docsUrl: string;
  authScheme: string;
  connectable: boolean;
  mode: "OAUTH" | "TOKEN_IMPORT" | "CREDENTIALS" | "UNAVAILABLE";
  requiredEnvVars: string[];
  reason?: string;
  supportsTokenImport: boolean;
  tokenImportLabel: string | null;
  actionCount: number;
  actions: Array<{
    slug: string;
    name: string;
    description: string;
    method: string;
    dangerous: boolean;
    parameters: ActionParamView[];
  }>;
  connection: {
    id: string;
    status: string;
    active: boolean;
    accountHint: string | null;
    scopes: string | null;
    lastError: string | null;
    tokenExpiresAt: string | null;
    connectedAt: string;
  } | null;
}

const CATEGORY_LABELS: Record<string, TranslationKey> = {
  DEVELOPMENT: "connectors.categories.DEVELOPMENT",
  COMMUNICATION: "connectors.categories.COMMUNICATION",
  PRODUCTIVITY: "connectors.categories.PRODUCTIVITY",
  CRM: "connectors.categories.CRM",
  PAYMENTS: "connectors.categories.PAYMENTS",
  SOCIAL: "connectors.categories.SOCIAL",
  DATA: "connectors.categories.DATA",
  CLOUD: "connectors.categories.CLOUD",
};

const STATUS_BADGES: Record<string, { labelKey: TranslationKey; cls: string }> = {
  ACTIVE: { labelKey: "common.connected", cls: "border-emerald-700/50 text-emerald-300" },
  INITIALIZING: { labelKey: "connectors.status.INITIALIZING", cls: "border-zinc-700 text-zinc-400" },
  INITIATED: { labelKey: "connectors.status.INITIATED", cls: "border-blue-700/50 text-blue-300" },
  FAILED: { labelKey: "connectors.status.FAILED", cls: "border-red-800/60 text-red-300" },
  EXPIRED: { labelKey: "connectors.status.EXPIRED", cls: "border-orange-700/50 text-orange-300" },
  REVOKED: { labelKey: "connectors.status.REVOKED", cls: "border-zinc-700 text-zinc-500" },
};

export default function ConnectorsPage() {
  const { toast } = useToast();
  const { t } = useI18n();
  const [apps, setApps] = useState<AppView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  // Console d'action.
  const [consoleApp, setConsoleApp] = useState<AppView | null>(null);
  const [consoleAction, setConsoleAction] = useState<AppView["actions"][number] | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [execResult, setExecResult] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/connectors/apps");
      const json = (await res.json()) as { ok: boolean; apps?: AppView[] };
      if (json.ok && json.apps) setApps(json.apps);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Bandeau de retour OAuth (?callback=…&status=…).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const callback = params.get("callback");
    const status = params.get("status");
    if (callback) {
      const detail = params.get("detail") ?? "";
      toast({
        title: status === "connected"
          ? t("connectors.oauth.callbackConnected", { app: callback })
          : t("connectors.oauth.callbackFailed", { app: callback }),
        description: detail || (status === "connected" ? t("connectors.oauth.usable") : undefined),
      });
      window.history.replaceState({}, "", "/connectors");
    }
  }, [toast]);

  const connectedCount = useMemo(
    () => apps.filter((a) => a.connection?.active).length,
    [apps]
  );

  const reloadAll = useCallback(() => {
    void refresh();
  }, [refresh]);

  async function connect(app: AppView) {
    setBusy(app.slug);
    try {
      const res = await fetch("/api/connectors/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appSlug: app.slug }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        mode?: string;
        redirectUrl?: string | null;
        error?: string;
      };
      if (json.ok && json.redirectUrl) {
        window.location.href = json.redirectUrl;
        return;
      }
      if (json.ok && json.mode === "DIRECT") {
        toast({ title: t("connectors.toast.saved"), description: t("connectors.toast.savedDesc", { app: app.name }) });
        await refresh();
        return;
      }
      toast({ title: t("connectors.toast.connectFailed"), description: json.error ?? t("connectors.errors.unknown"), variant: "destructive" });
    } catch (err) {
      toast({
        title: t("common.errorNetwork"),
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(app: AppView) {
    if (!app.connection) return;
    setBusy(app.slug);
    try {
      const res = await fetch(`/api/connectors/connections/${app.connection.id}`, { method: "DELETE" });
      const json = (await res.json()) as { ok: boolean };
      if (json.ok) {
        toast({ title: t("connectors.toast.disconnected"), description: t("connectors.toast.disconnectedDesc", { app: app.name }) });
        await refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function executeConsoleAction() {
    if (!consoleApp || !consoleAction) return;
    setExecuting(true);
    setExecResult(null);
    try {
      const params: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(paramValues)) {
        if (v !== "") params[k] = v;
      }
      const res = await fetch("/api/connectors/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appSlug: consoleApp.slug,
          actionSlug: consoleAction.slug,
          params,
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        status: number;
        output: string;
        error: string | null;
        latencyMs: number;
        // v4.3 — Action Gateway.
        executionStatus?: string;
        risk?: { level: string; score: number };
        executionId?: string;
      };
      const riskLine = json.risk
        ? `Risque : ${json.risk.level} (${json.risk.score}/100) · ${json.executionStatus ?? ""}\n`
        : "";
      setExecResult(
        `${json.ok ? t("connectors.console.ok") : t("connectors.console.fail")} HTTP ${json.status} — ${json.latencyMs} ms\n${riskLine}${
          json.error ? `${t("connectors.console.errorPrefix", { error: json.error })}\n` : ""
        }${json.output}`
      );
    } catch (err) {
      setExecResult(`${t("connectors.console.fail")} ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExecuting(false);
    }
  }

  const categories = useMemo(() => [...new Set(apps.map((a) => a.category))], [apps]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("connectors.title")}</h1>
          <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
            {t("connectors.subtitle")}
          </p>
        </div>
        <Badge variant="outline" className="border-emerald-700/40 text-emerald-300">
          {t("connectors.connectedCount", { connected: connectedCount, total: apps.length })}
        </Badge>
      </div>

      {/* v4.2 — Intégration Composio Cloud (SDK officiel, 300+ apps en un clic). */}
      <ComposioCard onConnectionsChanged={reloadAll} />

      {/* v4.3 — Action Gateway : permissions, risque, exécutions vérifiées, découverte. */}
      <GatewaySection />

      {/* v3.4 — Catalogue complet (1467 apps, modèle Composio managé). */}
      <CatalogSection onConnected={reloadAll} />

      <div className="pt-2">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500 mb-1">
          {t("connectors.native.title")}
        </h2>
        <p className="text-xs text-zinc-500 mb-4">
          {t("connectors.native.desc")}
        </p>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-44 bg-zinc-800/60" />
          ))}
        </div>
      ) : (
        categories.map((cat) => (
          <div key={cat}>
            <h2 className="text-sm font-semibold text-zinc-300 mb-3">
              {CATEGORY_LABELS[cat] ? t(CATEGORY_LABELS[cat]) : cat}
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {apps
                .filter((a) => a.category === cat)
                .map((app) => {
                  const conn = app.connection;
                  const statusMeta = conn ? STATUS_BADGES[conn.status] : undefined;
                  const status = statusMeta
                    ? { label: t(statusMeta.labelKey), cls: statusMeta.cls }
                    : conn
                      ? { label: conn.status, cls: "border-zinc-700 text-zinc-400" }
                      : null;
                  return (
                    <Card key={app.slug} className="bg-zinc-900/40 border-zinc-800">
                      <CardContent className="p-4 flex flex-col h-full">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700 text-lg">
                              {app.logo}
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-medium text-sm text-zinc-100 truncate">{app.name}</h3>
                              <a
                                href={app.docsUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1"
                              >
                                {t("connectors.docsLink")} <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            </div>
                          </div>
                          {status ? (
                            <Badge variant="outline" className={`text-[10px] shrink-0 ${status.cls}`}>
                              {conn?.active ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                              {status.label}
                            </Badge>
                          ) : null}
                        </div>

                        <p className="text-xs text-zinc-400 mt-2.5 leading-relaxed line-clamp-2">
                          {app.description}
                        </p>

                        <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                          <Badge variant="outline" className="text-[10px] font-mono border-zinc-700 text-zinc-500">
                            {app.authScheme}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-500">
                            {t("connectors.actionsCount", { count: app.actionCount })}
                          </Badge>
                          {conn?.accountHint && (
                            <Badge variant="outline" className="text-[10px] font-mono border-zinc-700 text-zinc-400">
                              {conn.accountHint}
                            </Badge>
                          )}
                        </div>

                        {conn?.lastError && (
                          <p className="text-[11px] text-red-300/80 mt-2 line-clamp-2">{conn.lastError}</p>
                        )}
                        {!app.connectable && app.reason && (
                          <p className="text-[11px] text-zinc-500 mt-2 flex items-start gap-1.5">
                            <Info className="h-3 w-3 mt-0.5 shrink-0" />
                            <span>
                              {app.reason}
                              {app.requiredEnvVars.length > 0 && (
                                <code className="ml-1 text-zinc-600">{app.requiredEnvVars.join(", ")}</code>
                              )}
                            </span>
                          </p>
                        )}

                        <div className="mt-auto pt-3 flex gap-2">
                          {conn?.active ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs"
                                onClick={() => {
                                  setConsoleApp(app);
                                  setConsoleAction(null);
                                  setParamValues({});
                                  setExecResult(null);
                                }}
                              >
                                <PlayCircle className="h-3.5 w-3.5 mr-1.5" />
                                {t("connectors.test")}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 text-xs text-red-300 hover:text-red-200"
                                disabled={busy === app.slug}
                                onClick={() => void disconnect(app)}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                                {t("connectors.disconnect")}
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              className="h-8 text-xs"
                              disabled={
                                !app.connectable ||
                                busy === app.slug ||
                                app.mode === "TOKEN_IMPORT" ||
                                app.mode === "CREDENTIALS" ||
                                app.mode === "UNAVAILABLE"
                              }
                              title={
                                app.mode === "OAUTH"
                                  ? t("connectors.oauth.redirectHint")
                                  : t("connectors.oauthOnly")
                              }
                              onClick={() => void connect(app)}
                            >
                              {busy === app.slug ? (
                                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                              ) : (
                                <PlugZap className="h-3.5 w-3.5 mr-1.5" />
                              )}
                              {app.mode === "OAUTH"
                                ? t("connectors.connectOauth")
                                : t("connectors.oauth.pending")}
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          </div>
        ))
      )}

      {/* Console d'exécution d'action */}
      <Dialog open={!!consoleApp} onOpenChange={(o) => !o && setConsoleApp(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("connectors.console.title", { app: consoleApp?.name ?? "" })}</DialogTitle>
            <DialogDescription>
              {t("connectors.console.desc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("connectors.console.action")}</Label>
              <select
                className="w-full h-9 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-200"
                value={consoleAction?.slug ?? ""}
                onChange={(e) => {
                  const action = consoleApp?.actions.find((a) => a.slug === e.target.value) ?? null;
                  setConsoleAction(action);
                  setParamValues({});
                  setExecResult(null);
                }}
              >
                <option value="">{t("connectors.console.chooseAction")}</option>
                {consoleApp?.actions.map((a) => (
                  <option key={a.slug} value={a.slug}>
                    {a.method} · {a.name}
                  </option>
                ))}
              </select>
            </div>

            {consoleAction && (
              <div className="grid sm:grid-cols-2 gap-2.5">
                {consoleAction.parameters.length === 0 ? (
                  <p className="text-xs text-zinc-500 sm:col-span-2">{t("connectors.console.noParams")}</p>
                ) : (
                  consoleAction.parameters.map((p) => (
                    <div key={p.name} className="space-y-1">
                      <Label className="text-[11px] font-mono">
                        {p.name}
                        {p.required ? <span className="text-red-400"> *</span> : null}
                        <span className="text-zinc-600 font-sans"> ({p.type})</span>
                      </Label>
                      <Input
                        value={paramValues[p.name] ?? ""}
                        onChange={(e) =>
                          setParamValues((prev) => ({ ...prev, [p.name]: e.target.value }))
                        }
                        placeholder={p.enum ? p.enum.join(" | ") : p.description}
                        className="h-8 text-xs"
                      />
                    </div>
                  ))
                )}
                {consoleAction.dangerous && (
                  <p className="text-[11px] text-orange-300/80 sm:col-span-2 flex items-center gap-1.5">
                    <ShieldAlert className="h-3 w-3" />
                    {t("connectors.console.dangerous")}
                  </p>
                )}
              </div>
            )}

            {execResult !== null && (
              <pre className="max-h-64 overflow-auto rounded-md border border-zinc-800 bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-300 whitespace-pre-wrap break-all">
                {execResult}
              </pre>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConsoleApp(null)}>{t("common.close")}</Button>
            <Button disabled={!consoleAction || executing} onClick={() => void executeConsoleAction()}>
              {executing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-1.5" />}
              {t("connectors.console.execute")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="bg-zinc-900/40 border-zinc-800">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Plug className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
            <div className="text-xs text-zinc-400 leading-relaxed">
              <p className="text-zinc-300 font-medium mb-1">
                {t("connectors.engine.title")}
              </p>
              <p>
                {renderRich(t("connectors.engine.desc"))}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
