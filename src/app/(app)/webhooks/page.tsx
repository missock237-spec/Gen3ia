"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { renderRich } from "@/lib/i18n/rich";
import { Loader2, Webhook, Trash2, PlusCircle, ShieldAlert, CheckCircle2, XCircle } from "lucide-react";

/**
 * Webhooks sortants — notifications HTTP des événements GEN3IA
 * (tâches terminées, erreurs, crédits…) avec secret de signature
 * et historique de livraisons signées.
 */

interface Delivery {
  id: string;
  event: string;
  statusCode: number | null;
  ok: boolean;
  error: string | null;
  createdAt: string;
}

interface WebhookView {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  agentId: string | null;
  createdAt: string;
  deliveries: Delivery[];
}

const EVENTS = [
  "task.created",
  "task.approved",
  "plan.generated",
  "plan.approved",
  "plan.rejected",
  "task.awaiting_human",
  "task.approval_expired",
  "task.completed",
  "task.failed",
  "task.cancelled",
];

export default function WebhooksPage() {
  const { toast } = useToast();
  const { t, lang } = useI18n();
  const locale = lang === "fr" ? "fr-FR" : "en-US";
  const [webhooks, setWebhooks] = useState<WebhookView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(["task.completed"]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/webhooks");
      const json = (await res.json()) as { ok: boolean; webhooks?: WebhookView[] };
      if (json.ok && json.webhooks) setWebhooks(json.webhooks);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function create() {
    if (!url.startsWith("https://") && !url.startsWith("http://")) {
      toast({ title: t("webhooks.errors.invalidUrl"), description: t("webhooks.errors.invalidUrlDesc"), variant: "destructive" });
      return;
    }
    if (selectedEvents.length === 0) {
      toast({ title: t("webhooks.errors.noEvents"), description: t("webhooks.errors.noEventsDesc"), variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, events: selectedEvents }),
      });
      const json = (await res.json()) as { ok: boolean; secret?: string; error?: string };
      if (json.ok) {
        toast({
          title: t("webhooks.created.title"),
          description: t("webhooks.created.desc"),
        });
        setShowForm(false);
        setUrl("");
        await refresh();
      } else {
        toast({ title: t("webhooks.errors.createFailed"), description: json.error, variant: "destructive" });
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggle(w: WebhookView) {
    setBusy(true);
    try {
      await fetch(`/api/webhooks/${w.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !w.active }),
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/webhooks/${id}`, { method: "DELETE" });
      toast({ title: t("webhooks.deleted") });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("webhooks.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            {t("webhooks.subtitle")}
          </p>
        </div>
        <Button onClick={() => setShowForm((s) => !s)} className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
          <PlusCircle className="h-4 w-4" /> {showForm ? t("common.close") : t("webhooks.create")}
        </Button>
      </div>

      {showForm && (
        <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <div className="space-y-2">
            <Label htmlFor="url">{t("webhooks.url")}</Label>
            <Input
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://votre-systeme.com/hooks/gen3ia"
              className="bg-zinc-950 border-zinc-800"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("webhooks.events")}</Label>
            <div className="flex flex-wrap gap-2">
              {EVENTS.map((ev) => {
                const on = selectedEvents.includes(ev);
                return (
                  <button
                    key={ev}
                    onClick={() => setSelectedEvents((s) => (on ? s.filter((x) => x !== ev) : [...s, ev]))}
                    className={`rounded-full border px-3 py-1 text-xs font-mono ${on ? "border-emerald-600 bg-emerald-500/10 text-emerald-300" : "border-zinc-800 text-zinc-500 hover:border-zinc-600"}`}
                  >
                    {ev}
                  </button>
                )
              })}
            </div>
          </div>
          <Button onClick={() => void create()} disabled={busy} className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("common.create")}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : webhooks.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-zinc-400">
          {t("webhooks.empty")}
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((w) => (
            <div key={w.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Webhook className="h-4 w-4 text-emerald-400" />
                  <code className="max-w-xs truncate text-xs text-zinc-300">{w.url}</code>
                  {w.active ? (
                    <Badge variant="outline" className="border-emerald-700/50 text-emerald-300">{t("webhooks.active")}</Badge>
                  ) : (
                    <Badge variant="outline" className="border-zinc-700 text-zinc-500">{t("webhooks.suspended")}</Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void toggle(w)}>
                    {w.active ? t("webhooks.suspend") : t("webhooks.resume")}
                  </Button>
                  <Button size="sm" variant="destructive" disabled={busy} onClick={() => void remove(w.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {w.events.map((ev) => (
                  <span key={ev} className="rounded-full border border-zinc-800 px-2 py-0.5 font-mono text-[10px] text-zinc-400">
                    {ev}
                  </span>
                ))}
              </div>
              {w.deliveries.length > 0 && (
                <div className="mt-3 border-t border-zinc-800 pt-3">
                  <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                    {t("webhooks.deliveries")}
                  </h4>
                  <div className="max-h-40 space-y-1 overflow-y-auto">
                    {w.deliveries.map((d) => (
                      <div key={d.id} className="flex items-center gap-2 text-xs">
                        {d.ok ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-red-400" />
                        )}
                        <span className="text-zinc-400">{d.event}</span>
                        <span className="text-zinc-600">HTTP {d.statusCode ?? "—"}</span>
                        <span className="ml-auto text-zinc-600">
                          {new Date(d.createdAt).toLocaleString(locale)}
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

      <div className="rounded-xl border border-amber-800/50 bg-amber-950/20 p-4">
        <div className="flex gap-3">
          <ShieldAlert className="h-5 w-5 shrink-0 text-amber-400" />
          <p className="text-xs leading-relaxed text-amber-200/80">
            {renderRich(t("webhooks.signatureHint"))}
          </p>
        </div>
      </div>
    </div>
  );
}
