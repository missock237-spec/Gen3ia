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

const CATEGORY_LABELS: Record<string, string> = {
  DEVELOPMENT: "Développement",
  COMMUNICATION: "Communication",
  PRODUCTIVITY: "Productivité",
  CRM: "CRM",
  PAYMENTS: "Paiements",
  SOCIAL: "Réseaux sociaux",
  DATA: "Données",
  CLOUD: "Cloud",
};

const STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "Connecté", cls: "border-emerald-700/50 text-emerald-300" },
  INITIALIZING: { label: "Initialisation", cls: "border-zinc-700 text-zinc-400" },
  INITIATED: { label: "En attente", cls: "border-blue-700/50 text-blue-300" },
  FAILED: { label: "Échec", cls: "border-red-800/60 text-red-300" },
  EXPIRED: { label: "Expiré", cls: "border-orange-700/50 text-orange-300" },
  REVOKED: { label: "Révoqué", cls: "border-zinc-700 text-zinc-500" },
};

export default function ConnectorsPage() {
  const { toast } = useToast();
  const [apps, setApps] = useState<AppView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  // Dialogue d'import de token.
  const [tokenApp, setTokenApp] = useState<AppView | null>(null);
  const [tokenValue, setTokenValue] = useState("");
  // Formulaire Jira (Basic + domaine).
  const [jiraDomain, setJiraDomain] = useState("");
  const [jiraEmail, setJiraEmail] = useState("");
  const [jiraToken, setJiraToken] = useState("");
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
        title: status === "connected" ? `Connexion ${callback} établie` : `Connexion ${callback} échouée`,
        description: detail || (status === "connected" ? "L'application est utilisable par vos agents." : undefined),
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
        toast({ title: "Connexion enregistrée", description: `${app.name} est connecté.` });
        await refresh();
        return;
      }
      toast({ title: "Connexion impossible", description: json.error ?? "Erreur inconnue", variant: "destructive" });
    } catch (err) {
      toast({
        title: "Erreur réseau",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  async function connectWithToken() {
    if (!tokenApp) return;
    setBusy(tokenApp.slug);
    try {
      const res = await fetch("/api/connectors/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appSlug: tokenApp.slug, token: tokenValue }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (json.ok) {
        toast({ title: "Token enregistré", description: `${tokenApp.name} est connecté (secret chiffré AES-256-GCM).` });
        setTokenApp(null);
        setTokenValue("");
        await refresh();
      } else {
        toast({ title: "Import refusé", description: json.error, variant: "destructive" });
      }
    } finally {
      setBusy(null);
    }
  }

  async function connectJira() {
    setBusy("jira");
    try {
      const res = await fetch("/api/connectors/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appSlug: "jira",
          username: jiraEmail,
          password: jiraToken,
          fields: { "your-domain": jiraDomain },
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (json.ok) {
        toast({ title: "Jira connecté", description: "Identifiants chiffrés et prêts à l'usage." });
        setTokenApp(null);
        setJiraDomain("");
        setJiraEmail("");
        setJiraToken("");
        await refresh();
      } else {
        toast({ title: "Connexion refusée", description: json.error, variant: "destructive" });
      }
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
        toast({ title: "Connexion supprimée", description: `${app.name} a été déconnecté.` });
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
      };
      setExecResult(
        `${json.ok ? "OK" : "ECHEC"} HTTP ${json.status} — ${json.latencyMs} ms\n${
          json.error ? `erreur : ${json.error}\n` : ""
        }${json.output}`
      );
    } catch (err) {
      setExecResult(`ECHEC ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExecuting(false);
    }
  }

  const categories = useMemo(() => [...new Set(apps.map((a) => a.category))], [apps]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Connecteurs</h1>
          <p className="text-sm text-zinc-400 mt-1 max-w-2xl">
            Connectez vos applications (OAuth2/OAuth1 ou clés) — les agents GEN3IA peuvent alors
            exécuter leurs actions réelles pendant les tâches. Les secrets sont chiffrés
            (AES-256-GCM) et jamais exposés à l&apos;interface.
          </p>
        </div>
        <Badge variant="outline" className="border-emerald-700/40 text-emerald-300">
          {connectedCount} / {apps.length} apps natives connectées
        </Badge>
      </div>

      {/* v3.4 — Catalogue complet (1467 apps, modèle Composio managé). */}
      <CatalogSection onConnected={reloadAll} />

      <div className="pt-2">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500 mb-1">
          Apps natives GEN3IA — actions exécutables en local
        </h2>
        <p className="text-xs text-zinc-500 mb-4">
          Ces applications disposent d&apos;actions intégrées au moteur (exécution directe par vos agents).
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
              {CATEGORY_LABELS[cat] ?? cat}
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {apps
                .filter((a) => a.category === cat)
                .map((app) => {
                  const conn = app.connection;
                  const status = conn
                    ? STATUS_BADGES[conn.status] ?? { label: conn.status, cls: "border-zinc-700 text-zinc-400" }
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
                                documentation <ExternalLink className="h-2.5 w-2.5" />
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
                            {app.actionCount} actions
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
                                Tester
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 text-xs text-red-300 hover:text-red-200"
                                disabled={busy === app.slug}
                                onClick={() => void disconnect(app)}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                                Déconnecter
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              className="h-8 text-xs"
                              disabled={!app.connectable || busy === app.slug}
                              onClick={() => {
                                if (app.slug === "jira") {
                                  setTokenApp(app);
                                } else if (app.mode === "TOKEN_IMPORT") {
                                  setTokenApp(app);
                                  setTokenValue("");
                                } else {
                                  void connect(app);
                                }
                              }}
                            >
                              {busy === app.slug ? (
                                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                              ) : (
                                <PlugZap className="h-3.5 w-3.5 mr-1.5" />
                              )}
                              {app.mode === "OAUTH" ? "Connecter (OAuth)" : "Ajouter un token"}
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

      {/* Dialogue : import de token / identifiants Jira */}
      <Dialog open={!!tokenApp} onOpenChange={(o) => !o && setTokenApp(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          {tokenApp?.slug === "jira" ? (
            <>
              <DialogHeader>
                <DialogTitle>Connecter Jira Cloud</DialogTitle>
                <DialogDescription>
                  Créez un token API sur id.atlassian.com → Sécurité → Token API.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Domaine Atlassian (sans .atlassian.com)</Label>
                  <Input value={jiraDomain} onChange={(e) => setJiraDomain(e.target.value)} placeholder="mon-entreprise" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Email du compte</Label>
                  <Input value={jiraEmail} onChange={(e) => setJiraEmail(e.target.value)} placeholder="vous@entreprise.com" type="email" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Token API</Label>
                  <Input value={jiraToken} onChange={(e) => setJiraToken(e.target.value)} placeholder="ATATT…" type="password" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setTokenApp(null)}>Annuler</Button>
                <Button disabled={busy === "jira" || !jiraDomain || !jiraEmail || !jiraToken} onClick={() => void connectJira()}>
                  {busy === "jira" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connecter"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Connecter {tokenApp?.name}</DialogTitle>
                <DialogDescription>
                  {tokenApp?.tokenImportLabel ?? "Collez votre token — il sera chiffré (AES-256-GCM) avant stockage."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Token / clé d&apos;API</Label>
                  <Input
                    value={tokenValue}
                    onChange={(e) => setTokenValue(e.target.value)}
                    placeholder="ghp_… / xoxb-… / secret_…"
                    type="password"
                  />
                </div>
                <p className="text-[11px] text-zinc-500 flex items-start gap-1.5">
                  <KeyRound className="h-3 w-3 mt-0.5 shrink-0" />
                  Le token ne transite jamais en clair en base et n&apos;est jamais renvoyé par l&apos;API.
                </p>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setTokenApp(null)}>Annuler</Button>
                <Button disabled={busy === tokenApp?.slug || tokenValue.length < 8} onClick={() => void connectWithToken()}>
                  {busy === tokenApp?.slug ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Console d'exécution d'action */}
      <Dialog open={!!consoleApp} onOpenChange={(o) => !o && setConsoleApp(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl">
          <DialogHeader>
            <DialogTitle>Tester {consoleApp?.name}</DialogTitle>
            <DialogDescription>
              Exécution réelle contre l&apos;API de l&apos;application connectée.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Action</Label>
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
                <option value="">— choisir une action —</option>
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
                  <p className="text-xs text-zinc-500 sm:col-span-2">Cette action n&apos;a aucun paramètre.</p>
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
                    Action en écriture : impact réel sur le compte connecté.
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
            <Button variant="ghost" onClick={() => setConsoleApp(null)}>Fermer</Button>
            <Button disabled={!consoleAction || executing} onClick={() => void executeConsoleAction()}>
              {executing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-1.5" />}
              Exécuter
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
                Moteur de connecteurs local (architecture Composio adaptée, MIT)
              </p>
              <p>
                Flux OAuth2 (PKCE), OAuth1.0a (HMAC-SHA1) et clés — exécution directe des API des
                applications, sans intermédiaire. Pour activer le flux OAuth d&apos;une app,
                renseignez ses variables serveur (ex.{" "}
                <code className="text-zinc-300">GITHUB_CLIENT_ID</code> /{" "}
                <code className="text-zinc-300">GITHUB_CLIENT_SECRET</code>). Les agents peuvent
                utiliser les actions via la clé d&apos;outil{" "}
                <code className="text-zinc-300">connector_&lt;app&gt;_&lt;action&gt;</code> (ou{" "}
                <code className="text-zinc-300">connectors</code> pour tout activer).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
