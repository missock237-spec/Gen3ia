"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { apiPost, useUser, type CurrentUser } from "@/lib/client/hooks";
import { Settings, Loader2, Save, ShieldCheck, Cpu, ListChecks, Languages, Check, AudioLines, Wrench } from "lucide-react";
import { VoiceSettingsCard } from "@/components/settings/voice-settings-card";
import { ToolsCatalogCard } from "@/components/settings/tools-catalog-card";

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
  const { t } = useI18n();
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
      toast({ title: t("settings.errors.saveFailed"), description: res.error, variant: "destructive" })
      return
    }
    onSaved()
    toast({ title: t("settings.saved") })
  }

  return (
    <>
      <Card className="bg-zinc-900/40 border-zinc-800" id="engine">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Cpu className="h-4 w-4 text-emerald-400" /> {t("settings.engine.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>{t("settings.engine.provider")}</Label>
            <select
              value={defaultProvider}
              onChange={(e) => setDefaultProvider(e.target.value)}
              className="w-full h-9 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
            >
              <option value="auto">{t("settings.engine.providerAuto")}</option>
              {providers.map((p) => (
                <option key={p.key} value={p.key} disabled={!p.available}>
                  {p.name} {p.available ? "" : t("settings.engine.providerUnavailable")}
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
              {t("settings.engine.maxAttempts")} <span className="font-mono text-emerald-400">{maxAttempts}</span>
            </Label>
            <Slider value={[maxAttempts]} onValueChange={([v]) => setMaxAttempts(v)} min={1} max={5} step={1} />
            <p className="text-xs text-zinc-500">
              {t("settings.engine.maxAttemptsHint")}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900/40 border-zinc-800" id="security">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" /> {t("settings.security.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-zinc-200">{t("settings.security.confirmTitle")}</div>
              <p className="text-xs text-zinc-500 mt-1 max-w-md">
                {t("settings.security.confirmDesc")}
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
            <ListChecks className="h-4 w-4 text-teal-400" /> {t("settings.explain.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-zinc-200">{t("settings.explain.toggleTitle")}</div>
              <p className="text-xs text-zinc-500 mt-1 max-w-md">
                {t("settings.explain.toggleDesc")}
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
          <span className="ml-2">{t("settings.saveAll")}</span>
        </Button>
      </div>
    </>
  )
}

export default function SettingsPage() {
  const { user, providers, loading, refresh } = useUser();
  const { t, lang, setLang } = useI18n();

  if (loading || !user) {
    return <Skeleton className="h-96 w-full bg-zinc-800/60" />
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="h-6 w-6 text-emerald-400" /> {t("settings.title")}
        </h1>
        <p className="text-sm text-zinc-400 mt-1">{t("settings.subtitle")}</p>
        {/* v4.1 (capture 1) — sections des paramètres : compte, vocal, outils, moteur, sécurité */}
        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              { href: "#account", label: t("settings.account.title"), icon: Settings },
              { href: "#voice", label: t("voice.title"), icon: AudioLines },
              { href: "#tools", label: t("tools.title"), icon: Wrench },
              { href: "#engine", label: t("settings.engine.title"), icon: Cpu },
              { href: "#security", label: t("settings.security.title"), icon: ShieldCheck },
            ] as const
          ).map(({ href, label, icon: Icon }) => (
            <a
              key={href}
              href={href}
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </a>
          ))}
        </div>
      </div>

      <Card className="bg-zinc-900/40 border-zinc-800" id="account">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.account.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-zinc-500">{t("common.name")}</span><span className="text-zinc-200">{user.name ?? "—"}</span></div>
          <div className="flex justify-between"><span className="text-zinc-500">{t("settings.account.email")}</span><span className="text-zinc-200 font-mono text-xs">{user.email}</span></div>
          <div className="flex justify-between"><span className="text-zinc-500">{t("settings.account.role")}</span><span className="text-zinc-200">{user.role}</span></div>
          <div className="flex justify-between"><span className="text-zinc-500">{t("settings.account.plan")}</span><span className="text-emerald-400">{user.plan}</span></div>
          <div className="flex justify-between"><span className="text-zinc-500">{t("common.credits")}</span><span className="text-emerald-400 font-mono">{user.credits.toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-zinc-500">{t("settings.account.memberSince")}</span><span className="text-zinc-400">{new Date(user.createdAt).toLocaleString(lang === "fr" ? "fr-FR" : "en-US")}</span></div>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900/40 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Languages className="h-4 w-4 text-emerald-400" /> {t("settings.language.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-xs text-zinc-500 max-w-md">{t("settings.language.desc")}</p>
            <div className="flex gap-2" role="group" aria-label={t("settings.language.title")}>
              <Button
                type="button"
                variant="outline"
                onClick={() => setLang("fr")}
                aria-pressed={lang === "fr"}
                className={`h-9 ${
                  lang === "fr"
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15"
                    : "border-zinc-700 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {lang === "fr" ? <Check className="h-4 w-4 mr-1.5" /> : null}
                🇫🇷 {t("common.french")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setLang("en")}
                aria-pressed={lang === "en"}
                className={`h-9 ${
                  lang === "en"
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15"
                    : "border-zinc-700 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {lang === "en" ? <Check className="h-4 w-4 mr-1.5" /> : null}
                🇬🇧 {t("common.english")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* v4.1 (captures 8-9) — mode vocal : personas, langue, historique de dictée */}
      <VoiceSettingsCard />

      {/* v4.1 — page outils intégrée aux paramètres (mission) */}
      <ToolsCatalogCard />

      <SettingsForm user={user} providers={providers} onSaved={refresh} />
    </div>
  )
}
