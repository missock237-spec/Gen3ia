"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiPost, useUser, formatDate, type CurrentUser } from "@/lib/client/hooks";
import { Settings, Loader2, Save, ShieldCheck, Cpu, ListChecks } from "lucide-react";

/** Formulaire initialisé UNE fois au montage à partir des préférences. */
function SettingsForm({
  user,
  providers,
  onSaved,
}: {
  user: CurrentUser
  providers: { key: string; name: string; available: boolean }[]
  onSaved: () => void
}) {
  const { toast } = useToast();
  const [maxAttempts, setMaxAttempts] = useState(user.settings.maxAttempts)
  const [confirmDangerousOps, setConfirmDangerousOps] = useState(user.settings.confirmDangerousOps)
  const [defaultProvider, setDefaultProvider] = useState(user.settings.defaultProvider)
  // v3.1 — mode Explain : approbation manuelle des plans avant exécution.
  const [planApproval, setPlanApproval] = useState(user.settings.planApproval === "manual")
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const res = await apiPost("/api/settings", {
      maxAttempts,
      confirmDangerousOps,
      defaultProvider,
      planApproval: planApproval ? "manual" : "auto",
    })
    setSaving(false)
    if (!res.ok) {
      toast({ title: "Enregistrement impossible", description: res.error, variant: "destructive" })
      return
    }
    onSaved()
    toast({ title: "Paramètres enregistrés" })
  }

  return (
    <>
      <Card className="bg-zinc-900/40 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Cpu className="h-4 w-4 text-emerald-400" /> Moteur d'exécution
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Fournisseur par défaut</Label>
            <select
              value={defaultProvider}
              onChange={(e) => setDefaultProvider(e.target.value)}
              className="w-full h-9 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
            >
              <option value="auto">Automatique (Model Router)</option>
              {providers.map((p) => (
                <option key={p.key} value={p.key} disabled={!p.available}>
                  {p.name} {p.available ? "" : "— non configuré"}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {providers.map((p) => (
                <span
                  key={p.key}
                  className={`text-[10px] font-mono border rounded px-1.5 py-0.5 ${
                    p.available ? "border-emerald-500/30 text-emerald-300" : "border-zinc-800 text-zinc-600"
                  }`}
                >
                  {p.key} {p.available ? "✓" : "—"}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>
              Tentatives d'auto-correction max : <span className="font-mono text-emerald-400">{maxAttempts}</span>
            </Label>
            <Slider value={[maxAttempts]} onValueChange={([v]) => setMaxAttempts(v)} min={1} max={5} step={1} />
            <p className="text-xs text-zinc-500">
              Nombre de tentatives de correction avant replanification ou échec déclaré.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900/40 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" /> Sécurité des opérations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-zinc-200">Confirmation humaine des opérations sensibles</div>
              <p className="text-xs text-zinc-500 mt-1 max-w-md">
                Exige votre approbation avant l'exécution de code ou de requêtes HTTP sortantes (Human-in-the-loop).
                Désactivé, le pipeline s'exécute sans interruption.
              </p>
            </div>
            <Switch
              checked={confirmDangerousOps}
              onCheckedChange={setConfirmDangerousOps}
              className="data-[state=checked]:bg-emerald-500"
            />
          </div>
        </CardContent>
      </Card>

      {/* v3.1 — Mode Explain */}
      <Card className="bg-zinc-900/40 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-teal-400" /> Mode Explain — validation des plans
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-zinc-200">Approuver les plans avant l'exécution</div>
              <p className="text-xs text-zinc-500 mt-1 max-w-md">
                Avant d'exécuter, GEN3IA vous présente les 5 plans notés : sélectionnez le plan de votre choix,
                éditez ses étapes, ou régénérez-les. Désactivé, l'évaluateur sélectionne et exécute
                automatiquement le meilleur plan.
              </p>
            </div>
            <Switch
              checked={planApproval}
              onCheckedChange={setPlanApproval}
              className="data-[state=checked]:bg-teal-500"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400 font-semibold h-10 px-6">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          <span className="ml-2">Enregistrer les paramètres</span>
        </Button>
      </div>
    </>
  )
}

export default function SettingsPage() {
  const { user, providers, loading, refresh } = useUser();

  if (loading || !user) {
    return <Skeleton className="h-96 w-full bg-zinc-800/60" />
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="h-6 w-6 text-emerald-400" /> Paramètres
        </h1>
        <p className="text-sm text-zinc-400 mt-1">Compte, autonomie du moteur et sécurité des opérations.</p>
      </div>

      <Card className="bg-zinc-900/40 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base">Compte</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-zinc-500">Nom</span><span className="text-zinc-200">{user.name ?? "—"}</span></div>
          <div className="flex justify-between"><span className="text-zinc-500">E-mail</span><span className="text-zinc-200 font-mono text-xs">{user.email}</span></div>
          <div className="flex justify-between"><span className="text-zinc-500">Rôle</span><span className="text-zinc-200">{user.role}</span></div>
          <div className="flex justify-between"><span className="text-zinc-500">Plan</span><span className="text-emerald-400">{user.plan}</span></div>
          <div className="flex justify-between"><span className="text-zinc-500">Crédits</span><span className="text-emerald-400 font-mono">{user.credits.toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-zinc-500">Membre depuis</span><span className="text-zinc-400">{formatDate(user.createdAt)}</span></div>
        </CardContent>
      </Card>

      <SettingsForm user={user} providers={providers} onSaved={refresh} />
    </div>
  )
}
