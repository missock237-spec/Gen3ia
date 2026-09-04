"use client";

/**
 * VoiceSettingsCard — section « Mode vocal » des paramètres (v4.1, captures).
 *
 * Reproduit le panneau de configuration vocale observé dans les captures :
 *  - personas vocaux (Maple, Ember, Sage, Coral, Onyx) avec pagination ;
 *  - langue (détection automatique / français / anglais) ;
 *  - historique de dictée (consultation + effacement) ;
 *  - préférences : enregistrer les dictées, conversations en arrière-plan.
 *
 * S'appuie sur les API réelles /api/voice/settings (GET/PUT) et
 * /api/voice/dictations (GET/DELETE) — aucune donnée simulée.
 */

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { usePolling, formatDate } from "@/lib/client/hooks";
import {
  AudioLines, Loader2, Globe, History, Trash2, ChevronLeft, ChevronRight, Check,
  Volume2, MessageSquare,
} from "lucide-react";

interface VoiceSettings {
  persona: string;
  language: "auto" | "fr" | "en";
  backgroundConversations: boolean;
  dictationsEnabled: boolean;
}

interface Dictation {
  id: string;
  text: string;
  lang: string;
  createdAt: string;
}

const PERSONA_KEYS = ["maple", "ember", "sage", "coral", "onyx"] as const;
type PersonaKey = (typeof PERSONA_KEYS)[number];

const PERSONA_AVATARS: Record<PersonaKey, string> = {
  maple: "from-sky-400/30 to-indigo-500/30",
  ember: "from-orange-400/30 to-rose-500/30",
  sage: "from-emerald-400/30 to-teal-500/30",
  coral: "from-pink-400/30 to-fuchsia-500/30",
  onyx: "from-zinc-500/30 to-slate-600/30",
};

export function VoiceSettingsCard() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [settings, setSettings] = useState<VoiceSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [personaIndex, setPersonaIndex] = useState(0);

  // Historique de dictée (rafraîchi après effacement).
  const { data: dictationsData, reload: reloadDictations } = usePolling<{
    ok: boolean;
    dictations: Dictation[];
  }>("/api/voice/dictations", null);

  const dictations = dictationsData?.dictations ?? [];

  // Chargement initial des préférences.
  useEffect(() => {
    if (settings) return;
    fetch("/api/voice/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.settings) {
          const s = json.settings as VoiceSettings;
          setSettings(s);
          setPersonaIndex(Math.max(0, PERSONA_KEYS.indexOf(s.persona as PersonaKey)));
        }
      })
      .catch(() => undefined);
  }, [settings]);

  async function persist(patch: Partial<VoiceSettings>) {
    setSaving(true);
    try {
      const json = await fetch("/api/voice/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }).then((r) => r.json());
      if (json?.ok) {
        setSettings((prev) => ({ ...(prev as VoiceSettings), ...patch }));
      } else {
        toast({ title: t("voice.errors.settingsFailed"), variant: "destructive" });
      }
    } catch {
      toast({ title: t("voice.errors.settingsFailed"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function clearHistory() {
    const res = await fetch("/api/voice/dictations", { method: "DELETE" });
    const json = await res.json().catch(() => null);
    if (json?.ok) {
      toast({ title: t("voice.historyCleared") });
      await reloadDictations();
    } else {
      toast({ title: t("voice.errors.settingsFailed"), variant: "destructive" });
    }
  }

  if (!settings) {
    return (
      <Card className="bg-zinc-900/40 border-zinc-800" id="voice">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AudioLines className="h-4 w-4 text-emerald-400" /> {t("voice.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full bg-zinc-800/60" />
        </CardContent>
      </Card>
    );
  }

  const persona = PERSONA_KEYS[personaIndex];
  const hasNext = personaIndex < PERSONA_KEYS.length - 1;
  const hasPrev = personaIndex > 0;

  return (
    <Card className="bg-zinc-900/40 border-zinc-800" id="voice">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <AudioLines className="h-4 w-4 text-emerald-400" /> {t("voice.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-xs text-zinc-500">{t("voice.subtitle")}</p>

        {/* Persona vocal — carrousel (captures : points de pagination) */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-5">
          <div className="flex items-center justify-between gap-4">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 border-zinc-700"
              disabled={!hasPrev}
              onClick={() => {
                const next = personaIndex - 1;
                setPersonaIndex(next);
                void persist({ persona: PERSONA_KEYS[next] });
              }}
              aria-label="Persona précédente"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="flex flex-col items-center gap-2">
              <div
                className={`flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br ${PERSONA_AVATARS[persona]} border border-zinc-700`}
              >
                <Volume2 className="h-7 w-7 text-zinc-200" />
              </div>
              <div className="text-base font-semibold text-zinc-100">
                {t(`voice.persona.${persona}`).split(" — ")[0]}
              </div>
              <div className="text-xs text-zinc-500">
                {t(`voice.persona.${persona}`).split(" — ")[1]}
              </div>
            </div>

            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 border-zinc-700"
              disabled={!hasNext}
              onClick={() => {
                const next = personaIndex + 1;
                setPersonaIndex(next);
                void persist({ persona: PERSONA_KEYS[next] });
              }}
              aria-label="Persona suivante"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Points de pagination */}
          <div className="mt-4 flex justify-center gap-1.5">
            {PERSONA_KEYS.map((p, i) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setPersonaIndex(i);
                  void persist({ persona: p });
                }}
                className={`h-1.5 rounded-full transition-all ${
                  i === personaIndex ? "w-5 bg-emerald-400" : "w-1.5 bg-zinc-700 hover:bg-zinc-600"
                }`}
                aria-label={p}
              />
            ))}
          </div>
          {saving && (
            <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-zinc-500">
              <Loader2 className="h-3 w-3 animate-spin" />
            </div>
          )}
        </div>

        {/* Langue */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <Globe className="mt-0.5 h-4 w-4 text-zinc-500" />
            <div>
              <div className="text-sm font-medium text-zinc-200">{t("voice.language")}</div>
            </div>
          </div>
          <select
            value={settings.language}
            onChange={(e) => void persist({ language: e.target.value as VoiceSettings["language"] })}
            className="h-9 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
          >
            <option value="auto">{t("voice.language.auto")}</option>
            <option value="fr">{t("voice.language.fr")}</option>
            <option value="en">{t("voice.language.en")}</option>
          </select>
        </div>

        {/* Enregistrer les dictées */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-zinc-200">{t("voice.dictationsEnabled")}</div>
            <p className="text-xs text-zinc-500 mt-0.5 max-w-sm">{t("voice.dictationsDesc")}</p>
          </div>
          <ToggleSwitch
            checked={settings.dictationsEnabled}
            onChange={(v) => void persist({ dictationsEnabled: v })}
          />
        </div>

        {/* Conversations en arrière-plan */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <MessageSquare className="mt-0.5 h-4 w-4 text-zinc-500" />
            <div>
              <div className="text-sm font-medium text-zinc-200">{t("voice.backgroundConversations")}</div>
              <p className="text-xs text-zinc-500 mt-0.5 max-w-sm">{t("voice.backgroundConversationsDesc")}</p>
            </div>
          </div>
          <ToggleSwitch
            checked={settings.backgroundConversations}
            onChange={(v) => void persist({ backgroundConversations: v })}
          />
        </div>

        {/* Historique de dictée */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
              <History className="h-4 w-4 text-zinc-500" /> {t("voice.history")}
            </div>
            {dictations.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void clearHistory()}
                className="h-7 border-red-900/50 text-red-300 hover:bg-red-950/30 text-[11px]"
              >
                <Trash2 className="mr-1 h-3 w-3" /> {t("voice.clearHistory")}
              </Button>
            )}
          </div>
          <p className="text-[11px] text-zinc-500">{t("voice.historyDesc")}</p>
          {dictations.length === 0 ? (
            <p className="py-3 text-center text-xs text-zinc-600">{t("voice.historyEmpty")}</p>
          ) : (
            <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
              {dictations.slice(0, 20).map((d) => (
                <div key={d.id} className="rounded-lg border border-zinc-800/70 bg-zinc-900/60 px-3 py-2">
                  <p className="line-clamp-2 text-xs text-zinc-300">{d.text}</p>
                  <p className="mt-1 text-[10px] text-zinc-600">
                    {formatDate(d.createdAt)} · {d.lang}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Interrupteur style capture (arrondi). */
function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        checked ? "bg-emerald-500" : "bg-zinc-700"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
          checked ? "left-[22px]" : "left-0.5"
        }`}
      />
      {checked && <Check className="absolute left-1.5 top-1.5 h-3 w-3 text-zinc-950" />}
    </button>
  );
}
