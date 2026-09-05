"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/lib/client/hooks";
import { useI18n } from "@/lib/i18n";
import {
  Cloud,
  Loader2,
  KeyRound,
  Trash2,
  ShieldCheck,
  ExternalLink,
  CircleCheck,
} from "lucide-react";

/**
 * Carte d'intégration Composio (v4.2) :
 * - statut global (configurée, nombre d'apps en un clic, live/statique) ;
 * - admin : enregistrement/rotation/suppression de la clé API
 *   (chiffrée AES-256-GCM côté serveur, jamais renvoyée) ;
 * - connexions hébergées de l'utilisateur (disconnect inclus).
 */

interface ComposioStatusView {
  configured: boolean;
  source: "env" | "db" | null;
  toolkitCount: number;
  toolkitSource: "live" | "static";
  liveError: string | null;
}

interface ConnectionView {
  id: string;
  appSlug: string;
  appName: string;
  status: string;
  active: boolean;
  provider: "local" | "composio";
  accountHint: string | null;
  connectedAt: string;
}

export function ComposioCard({ onConnectionsChanged }: { onConnectionsChanged?: () => void }) {
  const { toast } = useToast();
  const { t } = useI18n();
  const { user } = useUser();
  const isAdmin = user?.role === "ADMIN";

  const [status, setStatus] = useState<ComposioStatusView | null>(null);
  const [connections, setConnections] = useState<ConnectionView[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [busyConnection, setBusyConnection] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      // Route utilisateur (stats catalogue) : statut sans secret.
      const res = await fetch("/api/connectors/catalog?stats=1");
      const json = (await res.json()) as { ok: boolean; composio?: ComposioStatusView };
      if (json.ok && json.composio) setStatus(json.composio);
    } catch {
      /* statut indisponible : carte discrète */
    }
  }, []);

  const loadConnections = useCallback(async () => {
    try {
      const res = await fetch("/api/connectors/connections");
      const json = (await res.json()) as { ok: boolean; connections?: ConnectionView[] };
      if (json.ok && json.connections) {
        setConnections(json.connections.filter((c) => c.provider === "composio"));
      }
    } catch {
      /* liste indisponible */
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    void loadConnections();
  }, [loadStatus, loadConnections]);

  async function saveKey() {
    if (apiKey.trim().length < 8) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/composio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
        status?: ComposioStatusView;
      };
      if (json.ok && json.status) {
        setStatus(json.status);
        setApiKey("");
        if (json.status.liveError) {
          toast({
            title: t("composio.keySaved"),
            description: t("composio.keySavedNoLive", { error: json.status.liveError }),
          });
        } else {
          toast({
            title: t("composio.keySaved"),
            description: t("composio.keySavedDesc", {
              count: json.status.toolkitCount,
            }),
          });
        }
        onConnectionsChanged?.();
      } else {
        toast({
          title: t("composio.keyError"),
          description: json.error ?? "",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: t("common.errorNetwork"),
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function removeKey() {
    setRemoving(true);
    try {
      await fetch("/api/admin/composio", { method: "DELETE" });
      toast({
        title: t("composio.keyRemoved"),
        description: t("composio.keyRemovedDesc"),
      });
      await loadStatus();
    } finally {
      setRemoving(false);
    }
  }

  async function disconnect(id: string) {
    setBusyConnection(id);
    try {
      await fetch(`/api/connectors/connections/${id}`, { method: "DELETE" });
      await loadConnections();
      onConnectionsChanged?.();
    } finally {
      setBusyConnection(null);
    }
  }

  const configured = status?.configured ?? false;
  const hosted = connections;

  return (
    <Card className="border-zinc-800 bg-zinc-900/40">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Cloud className="h-5 w-5 text-emerald-400" />
          <CardTitle className="text-base">{t("composio.title")}</CardTitle>
          {configured ? (
            <Badge variant="outline" className="gap-1 border-emerald-700/50 text-emerald-300">
              <CircleCheck className="h-3 w-3" /> {t("composio.active")}
            </Badge>
          ) : (
            <Badge variant="outline" className="border-zinc-700 text-zinc-400">
              {t("composio.inactive")}
            </Badge>
          )}
        </div>
        <CardDescription className="text-xs leading-relaxed text-zinc-500">
          {t("composio.desc")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {configured && status ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
            <span className="font-medium text-zinc-200">
              {t("composio.toolkits", { count: status.toolkitCount })}
            </span>
            <span className="text-zinc-600">
              {status.toolkitSource === "live"
                ? t("composio.toolkitsSourceLive")
                : t("composio.toolkitsSourceStatic")}
            </span>
            {status.source === "env" && (
              <span className="flex items-center gap-1 text-zinc-600">
                <ShieldCheck className="h-3 w-3" />
                {t("composio.envManaged")}
              </span>
            )}
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-zinc-500">
            {isAdmin
              ? t("composio.notConfiguredAdmin")
              : t("composio.notConfiguredUser")}
          </p>
        )}

        {isAdmin && (
          <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
              <KeyRound className="h-3.5 w-3.5 text-emerald-400" />
              {t("composio.adminTitle")}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={t("composio.keyPlaceholder")}
                className="flex-1 bg-zinc-900 border-zinc-800"
                autoComplete="off"
              />
              <Button
                size="sm"
                onClick={() => void saveKey()}
                disabled={saving || apiKey.trim().length < 8}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("composio.save")}
              </Button>
              {status?.source === "db" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void removeKey()}
                  disabled={removing}
                >
                  {removing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  {t("composio.remove")}
                </Button>
              )}
            </div>
            <a
              href="https://dashboard.composio.dev/settings"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              {t("composio.getDashboard")}
            </a>
          </div>
        )}

        <div className="space-y-2">
          <div className="text-xs font-medium text-zinc-300">
            {t("composio.connections")}
            {hosted.length > 0 && (
              <span className="ml-2 text-zinc-600">({hosted.length})</span>
            )}
          </div>
          {hosted.length === 0 ? (
            <p className="text-xs text-zinc-600">{t("composio.noConnections")}</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {hosted.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium text-zinc-200">{c.appName}</div>
                    <div className="truncate text-[10px] text-zinc-600">
                      {c.accountHint ?? c.appSlug} ·{" "}
                      {t("composio.since", {
                        date: new Date(c.connectedAt).toLocaleDateString(),
                      })}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-red-400 hover:text-red-300"
                    disabled={busyConnection === c.id}
                    onClick={() => void disconnect(c.id)}
                  >
                    {busyConnection === c.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
