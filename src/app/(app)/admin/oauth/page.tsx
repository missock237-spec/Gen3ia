"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
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
      toast({ title: "Champs requis manquants", description: "appSlug, clientId et clientSecret sont obligatoires.", variant: "destructive" });
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
          title: "App OAuth activée",
          description: `${appSlug} est connectable par tous les utilisateurs${json.actionCount ? ` — ${json.actionCount} actions exécutables générées` : ""}.`,
        });
        setShowForm(false);
        setAppSlug(""); setClientId(""); setClientSecret(""); setScopes("");
        setAuthorizeUrl(""); setTokenUrl(""); setBaseUrl(""); setOpenapiSpec("");
        await refresh();
      } else {
        toast({ title: "Enregistrement refusé", description: json.error, variant: "destructive" });
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
        toast({ title: "Identifiants retirés", description: `${appSlug} n'accepte plus de nouvelles connexions.` });
        await refresh();
      } else {
        toast({ title: "Suppression refusée", description: json.error, variant: "destructive" });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Authentification OAuth de la plateforme</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            Enregistrez les identifiants OAuth de vos applications (créées chez chaque fournisseur).
            Les utilisateurs n&apos;ont alors qu&apos;à cliquer « Connecter » et autoriser leur compte —
            aucun jeton à leur faire saisir. Secrets chiffrés AES-256-GCM.
          </p>
        </div>
        <Button onClick={() => setShowForm((s) => !s)} className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
          <PlusCircle className="h-4 w-4" /> {showForm ? "Fermer" : "Activer une app"}
        </Button>
      </div>

      {showForm && (
        <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="appSlug">Slug de l&apos;app (catalogue)</Label>
              <Input id="appSlug" value={appSlug} onChange={(e) => setAppSlug(e.target.value)} placeholder="github, slack, notion, zoom…" className="bg-zinc-950 border-zinc-800" />
              <p className="text-[11px] text-zinc-500">Doit exister dans le catalogue (1467 apps).</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="scopes">Scopes (surcharge, CSV)</Label>
              <Input id="scopes" value={scopes} onChange={(e) => setScopes(e.target.value)} placeholder="read:user repo" className="bg-zinc-950 border-zinc-800" />
              <p className="text-[11px] text-zinc-500">Vide = scopes par défaut du registre d&apos;endpoints.</p>
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
              Endpoints personnalisés (app hors registre — sinon pré-remplis)
            </summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="authorizeUrl">URL d&apos;autorisation</Label>
                <Input id="authorizeUrl" value={authorizeUrl} onChange={(e) => setAuthorizeUrl(e.target.value)} placeholder="https://provider.com/oauth/authorize" className="bg-zinc-950 border-zinc-800" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tokenUrl">URL de token</Label>
                <Input id="tokenUrl" value={tokenUrl} onChange={(e) => setTokenUrl(e.target.value)} placeholder="https://provider.com/oauth/token" className="bg-zinc-950 border-zinc-800" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="baseUrl">Base URL de l&apos;API</Label>
                <Input id="baseUrl" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.provider.com/v1" className="bg-zinc-950 border-zinc-800" />
              </div>
            </div>
          </details>

          <details className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
            <summary className="cursor-pointer text-sm font-medium text-zinc-300">
              <FileJson className="mr-1 inline h-4 w-4" /> Spécification OpenAPI (génère les actions exécutables)
            </summary>
            <textarea
              value={openapiSpec}
              onChange={(e) => setOpenapiSpec(e.target.value)}
              rows={8}
              placeholder="Collez la spec OpenAPI/Swagger JSON de l'app — chaque opération devient une action réelle exécutable par les agents."
              className="mt-3 w-full rounded-md border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-200"
            />
          </details>

          <Button onClick={() => void submit()} disabled={busy} className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer et activer"}
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
          Aucune app OAuth enregistrée. Activez-en une pour rendre la connexion « 1 clic »
          disponible à tous les utilisateurs.
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
                    <Badge variant="outline" className="border-blue-700/50 text-blue-300">Endpoints connus</Badge>
                  ) : (
                    <Badge variant="outline" className="border-zinc-700 text-zinc-400">Endpoints custom</Badge>
                  )}
                  {app.actionCount > 0 && (
                    <Badge variant="outline" className="border-purple-700/50 text-purple-300">
                      {app.actionCount} actions OpenAPI
                    </Badge>
                  )}
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  client_id : <code className="text-zinc-400">{app.clientId.slice(0, 8)}…</code>
                  {app.scopes && <> · scopes : <span className="text-zinc-400">{app.scopes}</span></>}
                </div>
              </div>
              <Button size="sm" variant="destructive" disabled={busy} onClick={() => void remove(app.id, app.appSlug)}>
                <Trash2 className="h-4 w-4" /> Retirer
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
