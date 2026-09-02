"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PlugZap, Search, RefreshCw, Loader2, Unplug, ChevronDown, CheckCircle2,
  AlertTriangle, ExternalLink, KeyRound,
} from "lucide-react";

/**
 * Connecteurs — 1000+ applications externes via Composio (ADR-0014).
 * Flux réel : parcourir le catalogue → initier (lien OAuth hébergé Composio)
 * → autoriser chez le fournisseur → retour callback → statut ACTIVE →
 * les agents IA exécutent des actions authentifiées dans l'app.
 */

interface AppSummary {
  slug: string;
  name: string;
  description: string;
  categories: string[];
  logo: string | null;
  authGuideUrl?: string | null;
  connected: boolean;
  connectionStatus: string | null;
}

interface ConnectionView {
  id: string;
  toolkitSlug: string;
  toolkitName: string | null;
  composioId: string;
  status: string;
  statusReason: string | null;
  alias: string | null;
  executions: number;
  lastSyncedAt: string;
  createdAt: string;
}

interface ActionSummary {
  slug: string;
  name: string;
  description: string;
  toolkitSlug: string;
  toolkitName: string;
  noAuth: boolean;
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: "Connectée", className: "border-emerald-600/50 text-emerald-300" },
  INITIATED: { label: "Autorisation en attente", className: "border-amber-600/50 text-amber-300" },
  INITIALIZING: { label: "Initialisation", className: "border-zinc-600/50 text-zinc-300" },
  FAILED: { label: "Échec", className: "border-red-600/50 text-red-300" },
  EXPIRED: { label: "Expirée", className: "border-orange-600/50 text-orange-300" },
  INACTIVE: { label: "Inactive", className: "border-zinc-600/50 text-zinc-400" },
  REVOKED: { label: "Révoquée", className: "border-red-700/50 text-red-400" },
};

export default function ConnectorsPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loadingApps, setLoadingApps] = useState(true);
  const [connections, setConnections] = useState<ConnectionView[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [openApp, setOpenApp] = useState<string | null>(null);
  const [appActions, setAppActions] = useState<Record<string, ActionSummary[]>>({});
  const [loadingActions, setLoadingActions] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Message de retour OAuth (callback) — lecture client de la query string
  // (évite le bailout de prérendu statique de useSearchParams).
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const connected = sp.get("connected");
    const status = sp.get("status");
    if (connected) {
      setMessage(
        status === "failed" || status === "error"
          ? "La connexion n'a pas abouti. Vous pouvez réessayer."
          : "Autorisation traitée — les connexions ont été resynchronisées."
      );
      // Nettoie l'URL (historique propre) sans recharger.
      window.history.replaceState({}, "", "/connectors");
    }
  }, []);

  // Recherche débouncée.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const loadApps = useCallback(async () => {
    setLoadingApps(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (category) params.set("category", category);
      params.set("withCategories", "true");
      const res = await fetch(`/api/connectors/apps?${params.toString()}`);
      const json = await res.json();
      if (json.ok) {
        setApps(json.apps ?? []);
        setTotal(json.total ?? 0);
        setCategories(json.categories ?? []);
        setConfigured(Boolean(json.configured));
      } else {
        setMessage(json.error ?? "Impossible de charger le catalogue.");
      }
    } catch {
      setMessage("Erreur réseau lors du chargement du catalogue.");
    } finally {
      setLoadingApps(false);
    }
  }, [debouncedSearch, category]);

  const loadConnections = useCallback(async (sync = false) => {
    try {
      const res = await fetch(`/api/connectors/connections${sync ? "?sync=true" : ""}`);
      const json = await res.json();
      if (json.ok) setConnections(json.connections ?? []);
    } catch {
      /* silencieux : réessai au prochain cycle */
    }
  }, []);

  useEffect(() => {
    void loadApps();
  }, [loadApps]);

  useEffect(() => {
    void loadConnections(true);
  }, [loadConnections]);

  // Sondage pendant une autorisation en attente (statuts INITIATED).
  useEffect(() => {
    const pending = connections.some((c) => c.status === "INITIATED" || c.status === "INITIALIZING");
    if (pending && !pollRef.current) {
      pollRef.current = setInterval(() => void loadConnections(true), 6000);
    } else if (!pending && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [connections, loadConnections]);

  /** Initie la connexion : suit l'URL d'autorisation Composio (OAuth réel). */
  async function connect(app: AppSummary) {
    setConnecting(app.slug);
    setMessage(null);
    try {
      const res = await fetch("/api/connectors/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolkitSlug: app.slug }),
      });
      const json = await res.json();
      if (json.ok && json.redirectUrl) {
        // Navigation réelle vers la page d'autorisation du fournisseur
        // (hébergée par Composio) — le retour se fait sur /api/connectors/callback.
        window.location.href = json.redirectUrl as string;
      } else {
        setMessage(json.error ?? "Impossible d'initier la connexion.");
      }
    } catch {
      setMessage("Erreur réseau : réessayez.");
    } finally {
      setConnecting(null);
    }
  }

  async function disconnect(conn: ConnectionView) {
    setBusy(conn.id);
    try {
      const res = await fetch(`/api/connectors/connections/${conn.id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.ok) {
        await loadConnections();
        await loadApps();
        setMessage(`Application « ${conn.toolkitName ?? conn.toolkitSlug} » déconnectée.`);
      } else {
        setMessage(json.error ?? "Échec de la déconnexion.");
      }
    } finally {
      setBusy(null);
    }
  }

  async function resync() {
    setBusy("resync");
    try {
      await loadConnections(true);
      await loadApps();
    } finally {
      setBusy(null);
    }
  }

  /** Charge les actions d'une app connectée (explorateur pour l'utilisateur). */
  async function toggleActions(slug: string) {
    if (openApp === slug) {
      setOpenApp(null);
      return;
    }
    setOpenApp(slug);
    if (!appActions[slug]) {
      setLoadingActions(slug);
      try {
        const res = await fetch(`/api/connectors/apps/${encodeURIComponent(slug)}?actionsLimit=15`);
        const json = await res.json();
        if (json.ok) setAppActions((prev) => ({ ...prev, [slug]: json.actions ?? [] }));
      } finally {
        setLoadingActions(null);
      }
    }
  }

  const activeCount = connections.filter((c) => c.status === "ACTIVE").length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Connecteurs</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Connectez vos applications externes (GitHub, Slack, Notion, Gmail, WhatsApp…) — vos agents IA
            pourront ensuite agir directement dans ces apps de manière authentifiée.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={resync}
          disabled={busy === "resync"}
          className="border-zinc-800 bg-zinc-900/40 hover:bg-zinc-800/60"
        >
          {busy === "resync" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Resynchroniser
        </Button>
      </div>

      {message && (
        <div className="rounded-lg border border-emerald-800/40 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {message}
        </div>
      )}

      {configured === false && (
        <Card className="bg-amber-950/20 border-amber-800/40">
          <CardContent className="p-4 flex items-start gap-3">
            <KeyRound className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-200">Connecteurs non activés sur ce serveur</p>
              <p className="text-amber-300/70 mt-1">
                Définissez la variable d&apos;environnement <code className="font-mono text-xs">COMPOSIO_API_KEY</code> (clé
                gratuite sur dashboard.composio.dev) pour activer le catalogue des 1000+ applications.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mes connexions */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-300">
            Mes connexions
            <span className="ml-2 text-zinc-500 font-normal">
              {activeCount} active{activeCount > 1 ? "s" : ""} / {connections.length}
            </span>
          </h2>
        </div>
        {connections.length === 0 ? (
          <Card className="bg-zinc-900/40 border-zinc-800 border-dashed">
            <CardContent className="p-6 text-center text-sm text-zinc-500">
              Aucune application connectée. Choisissez-en une ci-dessous pour donner à vos agents
              un accès authentifié.
            </CardContent>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {connections.map((c) => {
              const style = STATUS_STYLES[c.status] ?? {
                label: c.status,
                className: "border-zinc-700 text-zinc-400",
              };
              return (
                <Card key={c.id} className="bg-zinc-900/40 border-zinc-800">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                          <PlugZap className="h-4 w-4 text-emerald-400" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-medium text-sm text-zinc-100 truncate">
                            {c.toolkitName ?? c.toolkitSlug}
                          </h3>
                          <code className="text-[10px] font-mono text-zinc-600">{c.toolkitSlug}</code>
                        </div>
                      </div>
                      <Badge variant="outline" className={`text-[10px] shrink-0 ${style.className}`}>
                        {style.label}
                      </Badge>
                    </div>
                    {c.statusReason && (
                      <p className="text-[11px] text-zinc-500 mt-2 truncate">{c.statusReason}</p>
                    )}
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-[11px] text-zinc-500 font-mono">
                        {c.executions} action{c.executions > 1 ? "s" : ""}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => disconnect(c)}
                        disabled={busy === c.id}
                        className="h-7 text-xs text-zinc-400 hover:text-red-300 hover:bg-red-950/30"
                      >
                        {busy === c.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Unplug className="h-3 w-3" />
                        )}
                        Déconnecter
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Catalogue */}
      <section>
        <div className="flex flex-col sm:flex-row gap-3 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une application (slack, github, notion…)"
              className="bg-zinc-950 border-zinc-800 pl-9"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-9 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-300"
          >
            <option value="">Toutes les catégories</option>
            {categories.slice(0, 40).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {loadingApps ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-32 bg-zinc-800/60" />
            ))}
          </div>
        ) : apps.length === 0 ? (
          <Card className="bg-zinc-900/40 border-zinc-800 border-dashed">
            <CardContent className="p-6 text-center text-sm text-zinc-500">
              {configured === false
                ? "Activez COMPOSIO_API_KEY pour parcourir le catalogue."
                : "Aucune application ne correspond à cette recherche."}
            </CardContent>
          </Card>
        ) : (
          <>
            <p className="text-xs text-zinc-500 mb-2">
              {total} applications au catalogue Composio — les plus utilisées d&apos;abord.
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {apps.map((app) => {
                const isPending = app.connectionStatus === "INITIATED" || app.connectionStatus === "INITIALIZING";
                return (
                  <Card key={app.slug} className="bg-zinc-900/40 border-zinc-800">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700 overflow-hidden">
                            {app.logo ? (
                              <img src={app.logo} alt="" className="h-5 w-5 object-contain" />
                            ) : (
                              <PlugZap className="h-4 w-4 text-zinc-400" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-medium text-sm text-zinc-100 truncate">{app.name}</h3>
                            <code className="text-[10px] font-mono text-zinc-600">{app.slug}</code>
                          </div>
                        </div>
                        {app.connected && (
                          <Badge
                            variant="outline"
                            className={`text-[10px] shrink-0 ${STATUS_STYLES[app.connectionStatus ?? ""]?.className ?? "border-emerald-600/50 text-emerald-300"}`}
                          >
                            {STATUS_STYLES[app.connectionStatus ?? "ACTIVE"]?.label ?? "Connectée"}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 mt-2.5 leading-relaxed line-clamp-2">
                        {app.description || "Application du catalogue Composio."}
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => connect(app)}
                          disabled={connecting === app.slug || isPending}
                          className="h-8 text-xs bg-emerald-500/90 hover:bg-emerald-400 text-zinc-950 font-medium"
                        >
                          {connecting === app.slug ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <PlugZap className="h-3.5 w-3.5" />
                          )}
                          {app.connected ? "Reconnecter" : "Connecter"}
                          <ExternalLink className="h-3 w-3 ml-1.5 opacity-60" />
                        </Button>
                        {app.connected && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleActions(app.slug)}
                            className="h-8 text-xs text-zinc-400 hover:text-zinc-100"
                          >
                            <ChevronDown
                              className={`h-3.5 w-3.5 transition-transform ${openApp === app.slug ? "rotate-180" : ""}`}
                            />
                            Actions
                          </Button>
                        )}
                      </div>
                      {openApp === app.slug && (
                        <div className="mt-3 border-t border-zinc-800/60 pt-3">
                          {loadingActions === app.slug ? (
                            <div className="flex items-center gap-2 text-xs text-zinc-500">
                              <Loader2 className="h-3 w-3 animate-spin" /> Chargement des actions…
                            </div>
                          ) : (appActions[app.slug] ?? []).length === 0 ? (
                            <p className="text-xs text-zinc-500">
                              Aucune action visible (connexion requise / catalogue restreint).
                            </p>
                          ) : (
                            <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                              {appActions[app.slug].map((a) => (
                                <li key={a.slug} className="text-xs">
                                  <span className="text-zinc-300 font-medium">{a.name}</span>
                                  <code className="ml-1.5 text-[9px] font-mono text-zinc-600">{a.slug}</code>
                                  <p className="text-zinc-500 line-clamp-1">{a.description}</p>
                                </li>
                              ))}
                            </ul>
                          )}
                          {app.authGuideUrl && (
                            <a
                              href={app.authGuideUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 inline-flex items-center gap-1 text-[11px] text-emerald-400/80 hover:text-emerald-300"
                            >
                              Guide d&apos;authentification <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </section>

      <p className="text-[11px] text-zinc-600 flex items-start gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        Les jetons d&apos;authentification sont conservés dans le coffre Composio — GEN3IA n&apos;y a jamais
        accès. Chaque action exécutée par un agent est journalisée (audit + compteur d&apos;usage).
      </p>
    </div>
  );
}
