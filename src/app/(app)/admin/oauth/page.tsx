"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { Loader2, KeyRound, Trash2, PlusCircle, FileJson } from "lucide-react";

/**
 * Registre OAuth de la plateforme (modèle « auth gérée » Composio).
 * L'opérateur enregistre ici les client_id/client_secret de SES applications
 * OAuth (créées chez chaque fournisseur). Dès l'enregistrement, tous les
 * utilisateurs voient « Connecter » fonctionner — sans jamais manipuler de
 * jeton. La spec OpenAPI (optionnelle) génère les actions exécutables.
 */

interface AdminApp {
  id: string;
  appSlug: string;
  appName: string;
  clientId: string;
  scopes: string | null;
  active: boolean;
  redirectUri: string | null;
  actionCount: number;
  openapiTitle: string | null;
  openapiWarnings: string[];
  inRegistry: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function AdminOAuthPage() {
  const { toast } = useToast();
  const { t } = useI18n();
  const [apps, setApps] = useState<AdminApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Formulaire
  const [appSlug, setAppSlug] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [scopes, setScopes] = useState("");
  const [authorizeUrl, setAuthorizeUrl] = useState("");
  const [tokenUrl, setTokenUrl] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [openapiSpec, setOpenapiSpec] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/oauth-apps");
      const json = (await res.json()) as { ok: boolean; apps?: AdminApp[] };
      if (json.ok && json.apps) setApps(json.apps);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function submit() {
    if (!appSlug || !clientId || !clientSecret) {
      toast({ title: t("admin.oauth.errors.missing"), description: t("admin.oauth.errors.missingDesc"), variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { appSlug, clientId, clientSecret };
      if (scopes) body.scopes = scopes;
      if (authorizeUrl && tokenUrl && baseUrl) {
        body.endpoints = { authorizeUrl, tokenUrl, baseUrl };
      }
      if (openapiSpec.trim()) body.openapiSpec = openapiSpec.trim();
      const res = await fetch("/api/admin/oauth-apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { ok: boolean; actionCount?: number; error?: string };
      if (json.ok) {
        toast({
          title: t("admin.oauth.enabled.title"),
          description: `${t("admin.oauth.enabled.desc", { app: appSlug })}${json.actionCount ? t("admin.oauth.enabled.actions", { count: json.actionCount }) : ""}.`,
        });
        setShowForm(false);
        setAppSlug(""); setClientId(""); setClientSecret(""); setScopes("");
        setAuthorizeUrl(""); setTokenUrl(""); setBaseUrl(""); setOpenapiSpec("");
        await refresh();
      } else {
        toast({ title: t("admin.oauth.errors.registerFailed"), description: json.error, variant: "destructive" });
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, appSlug: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/oauth-apps/${id}`, { method: "DELETE" });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (json.ok) {
        toast({ title: t("admin.oauth.removed.title"), description: t("admin.oauth.removed.desc", { app: appSlug }) });
        await refresh();
      } else {
        toast({ title: t("admin.oauth.errors.removeFailed"), description: json.error, variant: "destructive" });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("admin.oauth.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            {t("admin.oauth.subtitle")}
          </p>
        </div>
        <Button onClick={() => setShowForm((s) => !s)} className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
          <PlusCircle className="h-4 w-4" /> {showForm ? t("common.close") : t("admin.oauth.enable")}
        </Button>
      </div>

      {showForm && (
        <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="appSlug">{t("admin.oauth.appSlug")}</Label>
              <Input id="appSlug" value={appSlug} onChange={(e) => setAppSlug(e.target.value)} placeholder="github, slack, notion, zoom…" className="bg-zinc-950 border-zinc-800" />
              <p className="text-[11px] text-zinc-500">{t("admin.oauth.appSlugHint")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="scopes">{t("admin.oauth.scopes")}</Label>
              <Input id="scopes" value={scopes} onChange={(e) => setScopes(e.target.value)} placeholder="read:user repo" className="bg-zinc-950 border-zinc-800" />
              <p className="text-[11px] text-zinc-500">{t("admin.oauth.scopesHint")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="clientId">Client ID</Label>
              <Input id="clientId" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Ov23li…" className="bg-zinc-950 border-zinc-800" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clientSecret">Client Secret</Label>
              <Input id="clientSecret" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="••••••••" className="bg-zinc-950 border-zinc-800" />
            </div>
          </div>

          <details className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
            <summary className="cursor-pointer text-sm font-medium text-zinc-300">
              {t("admin.oauth.endpoints")}
            </summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="authorizeUrl">{t("admin.oauth.authorizeUrl")}</Label>
                <Input id="authorizeUrl" value={authorizeUrl} onChange={(e) => setAuthorizeUrl(e.target.value)} placeholder="https://provider.com/oauth/authorize" className="bg-zinc-950 border-zinc-800" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tokenUrl">{t("admin.oauth.tokenUrl")}</Label>
                <Input id="tokenUrl" value={tokenUrl} onChange={(e) => setTokenUrl(e.target.value)} placeholder="https://provider.com/oauth/token" className="bg-zinc-950 border-zinc-800" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="baseUrl">{t("admin.oauth.baseUrl")}</Label>
                <Input id="baseUrl" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.provider.com/v1" className="bg-zinc-950 border-zinc-800" />
              </div>
            </div>
          </details>

          <details className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
            <summary className="cursor-pointer text-sm font-medium text-zinc-300">
              <FileJson className="mr-1 inline h-4 w-4" /> {t("admin.openapi")}
            </summary>
            <textarea
              value={openapiSpec}
              onChange={(e) => setOpenapiSpec(e.target.value)}
              rows={8}
              placeholder={t("admin.oauth.specPlaceholder")}
              className="mt-3 w-full rounded-md border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-200"
            />
          </details>

          <Button onClick={() => void submit()} disabled={busy} className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("admin.oauth.submit")}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : apps.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-zinc-400">
          {t("admin.oauth.empty")}
        </div>
      ) : (
        <div className="space-y-3">
          {apps.map((app) => (
            <div key={app.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-emerald-400" />
                  <span className="font-semibold text-zinc-100">{app.appName}</span>
                  <code className="text-[11px] text-zinc-500">{app.appSlug}</code>
                  {app.active && <Badge variant="outline" className="border-emerald-700/50 text-emerald-300">Active</Badge>}
                  {app.inRegistry ? (
                    <Badge variant="outline" className="border-blue-700/50 text-blue-300">{t("admin.oauth.knownEndpoints")}</Badge>
                  ) : (
                    <Badge variant="outline" className="border-zinc-700 text-zinc-400">{t("admin.oauth.customEndpoints")}</Badge>
                  )}
                  {app.actionCount > 0 && (
                    <Badge variant="outline" className="border-purple-700/50 text-purple-300">
                      {t("admin.oauth.openapiActions", { count: app.actionCount })}
                    </Badge>
                  )}
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  client_id : <code className="text-zinc-400">{app.clientId.slice(0, 8)}…</code>
                  {app.scopes && <> · scopes : <span className="text-zinc-400">{app.scopes}</span></>}
                </div>
              </div>
              <Button size="sm" variant="destructive" disabled={busy} onClick={() => void remove(app.id, app.appSlug)}>
                <Trash2 className="h-4 w-4" /> {t("admin.oauth.remove")}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
