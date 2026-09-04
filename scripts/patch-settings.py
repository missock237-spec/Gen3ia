# -*- coding: utf-8 -*-
"""Settings page: add Voice + Tools sections with anchor nav (v4.1)."""

path = "src/app/(app)/settings/page.tsx"
with open(path, encoding="utf-8") as f:
    c = f.read()

# 1. Imports
old = 'import { Settings, Loader2, Save, ShieldCheck, Cpu, ListChecks, Languages, Check } from "lucide-react";'
new = '''import { Settings, Loader2, Save, ShieldCheck, Cpu, ListChecks, Languages, Check, AudioLines, Wrench } from "lucide-react";
import { VoiceSettingsCard } from "@/components/settings/voice-settings-card";
import { ToolsCatalogCard } from "@/components/settings/tools-catalog-card";'''
assert old in c, "imports"
c = c.replace(old, new, 1)

# 2. Section anchors navigation after the header
old = '''      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="h-6 w-6 text-emerald-400" /> {t("settings.title")}
        </h1>
        <p className="text-sm text-zinc-400 mt-1">{t("settings.subtitle")}</p>
      </div>'''
new = '''      <div>
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
      </div>'''
assert old in c, "header"
c = c.replace(old, new, 1)

# 3. Anchor on the account card
old = '''      <Card className="bg-zinc-900/40 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.account.title")}</CardTitle>
        </CardHeader>'''
new = '''      <Card className="bg-zinc-900/40 border-zinc-800" id="account">
        <CardHeader>
          <CardTitle className="text-base">{t("settings.account.title")}</CardTitle>
        </CardHeader>'''
assert old in c, "account card"
c = c.replace(old, new, 1)

# 4. Voice + Tools sections after the language card, before SettingsForm
old = "      <SettingsForm user={user} providers={providers} onSaved={refresh} />"
new = """      {/* v4.1 (captures 8-9) — mode vocal : personas, langue, historique de dictée */}
      <VoiceSettingsCard />

      {/* v4.1 — page outils intégrée aux paramètres (mission) */}
      <ToolsCatalogCard />

      <SettingsForm user={user} providers={providers} onSaved={refresh} />"""
assert old in c, "form"
c = c.replace(old, new, 1)

with open(path, "w", encoding="utf-8") as f:
    f.write(c)
print("settings OK")
