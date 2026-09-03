"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import { Loader2, Eye, Trash2, PlusCircle, Clock, Activity } from "lucide-react";

/**
 * Watchdog — surveillance planifiée (prix, sites, indicateurs) avec
 * exécutions périodiques et alertes (email/slack/webhook).
 */

interface Execution {
  id: string;
  value: string | null;
  triggered: boolean;
  alertSent: boolean;
  error: string | null;
  executedAt: string;
}

interface WatchView {
  id: string;
  name: string;
  type: string;
  target: string;
  schedule: string;
  condition: string | null;
  alertChannel: string;
  alertTarget: string | null;
  active: boolean;
  createdAt: string;
  executions: Execution[];
}

const TYPES: Array<{ value: string; labelKey: TranslationKey }> = [
  { value: "PRICE", labelKey: "watchdog.types.PRICE" },
  { value: "WEBSITE", labelKey: "watchdog.types.WEBSITE" },
  { value: "INDICATOR", labelKey: "watchdog.types.INDICATOR" },
  { value: "CUSTOM", labelKey: "watchdog.types.CUSTOM" },
];

export default function WatchdogPage() {
  const { toast } = useToast();
  const { t, lang } = useI18n();
  const locale = lang === "fr" ? "fr-FR" : "en-US";
  const [watches, setWatches] = useState<WatchView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("PRICE");
  const [target, setTarget] = useState("");
  const [schedule, setSchedule] = useState("0 */6 * * *");
  const [alertChannel, setAlertChannel] = useState("email");
  const [alertTarget, setAlertTarget] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/watchdog");
      const json = (await res.json()) as { ok: boolean; watches?: WatchView[] };
      if (json.ok && json.watches) setWatches(json.watches);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function create() {
    if (!name || !target || !schedule) {
      toast({ title: t("watchdog.errors.missing"), description: t("watchdog.errors.missingDesc"), variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/watchdog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, target, schedule, alertChannel, alertTarget: alertTarget || undefined }),
      });
      const json = (await res.json()) as { ok: boolean; watchId?: string; error?: string };
      if (json.ok) {
        toast({ title: t("watchdog.created.title"), description: t("watchdog.created.desc") });
        setShowForm(false);
        setName(""); setTarget(""); setAlertTarget("");
        await refresh();
      } else {
        toast({ title: t("watchdog.errors.createFailed"), description: json.error, variant: "destructive" });
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/watchdog/${id}`, { method: "DELETE" });
      toast({ title: t("watchdog.deleted") });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("watchdog.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            {t("watchdog.subtitle")}
          </p>
        </div>
        <Button onClick={() => setShowForm((s) => !s)} className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
          <PlusCircle className="h-4 w-4" /> {showForm ? t("common.close") : t("watchdog.new")}
        </Button>
      </div>

      {showForm && (
        <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">{t("common.name")}</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("watchdog.namePlaceholder")} className="bg-zinc-950 border-zinc-800" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <select
                id="type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="h-9 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-200"
              >
                {TYPES.map((tp) => (
                  <option key={tp.value} value={tp.value}>{t(tp.labelKey)}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="target">{t("watchdog.target")}</Label>
              <Input id="target" value={target} onChange={(e) => setTarget(e.target.value)} placeholder={t("watchdog.targetPlaceholder")} className="bg-zinc-950 border-zinc-800" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedule">{t("watchdog.schedule")}</Label>
              <Input id="schedule" value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="0 */6 * * *" className="bg-zinc-950 border-zinc-800 font-mono text-xs" />
              <p className="text-[11px] text-zinc-500">{t("watchdog.scheduleHint")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="channel">{t("watchdog.channel")}</Label>
              <select
                id="channel"
                value={alertChannel}
                onChange={(e) => setAlertChannel(e.target.value)}
                className="h-9 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-200"
              >
                <option value="email">{t("watchdog.channel.email")}</option>
                <option value="slack">{t("watchdog.channel.slack")}</option>
                <option value="webhook">{t("watchdog.channel.webhook")}</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="alertTarget">{t("watchdog.destination")}</Label>
              <Input id="alertTarget" value={alertTarget} onChange={(e) => setAlertTarget(e.target.value)} placeholder={t("watchdog.destinationPlaceholder")} className="bg-zinc-950 border-zinc-800" />
            </div>
          </div>
          <Button onClick={() => void create()} disabled={busy} className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("watchdog.submit")}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : watches.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-zinc-400">
          {t("watchdog.empty")}
        </div>
      ) : (
        <div className="space-y-3">
          {watches.map((w) => (
            <div key={w.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-emerald-400" />
                  <span className="font-semibold text-zinc-100">{w.name}</span>
                  <Badge variant="outline" className="border-zinc-700 text-zinc-400">{w.type}</Badge>
                </div>
                <Button size="sm" variant="destructive" disabled={busy} onClick={() => void remove(w.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="mt-2 space-y-1 text-xs text-zinc-500">
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5" />
                  <code className="text-zinc-400">{w.schedule}</code>
                  <span className="text-zinc-600">·</span>
                  <code className="truncate text-zinc-400">{w.target}</code>
                </div>
                <div className="flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5" />
                  {t("watchdog.alerts")} {w.alertChannel}
                  {w.alertTarget && <span className="text-zinc-600">→ {w.alertTarget}</span>}
                </div>
              </div>
              {w.executions.length > 0 && (
                <div className="mt-3 border-t border-zinc-800 pt-3">
                  <div className="max-h-40 space-y-1 overflow-y-auto">
                    {w.executions.map((ex) => (
                      <div key={ex.id} className="flex items-center gap-2 text-xs">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${ex.triggered ? "bg-amber-500" : ex.error ? "bg-red-500" : "bg-emerald-500"}`} />
                        <span className="text-zinc-400">{ex.value ?? ex.error ?? "—"}</span>
                        {ex.triggered && <Badge variant="outline" className="border-amber-700/50 text-[10px] text-amber-300">{t("watchdog.triggered")}</Badge>}
                        <span className="ml-auto text-zinc-600">
                          {new Date(ex.executedAt).toLocaleString(locale)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
