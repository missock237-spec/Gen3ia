"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Radio, MonitorUp, ArrowRight, PlayCircle } from "lucide-react";

/**
 * Mode live — sessions de partage d'écran temps réel.
 * Créez une session, partagez le code, diffusez votre écran : vos
 * spectateurs voient tout en direct (WebRTC P2P chiffré).
 */

interface HostedSession {
  id: string;
  code: string;
  title: string | null;
  taskId: string | null;
  status: string;
  viewerCount: number;
  participants: Array<{ id: string; displayName: string; role: string }>;
  createdAt: string;
}

interface JoinedSession {
  participantId: string;
  sessionId: string;
  code: string;
  title: string | null;
  status: string;
  host: string;
  joinedAt: string;
}

export default function LivePage() {
  const { toast } = useToast();
  const router = useRouter();
  const [hosted, setHosted] = useState<HostedSession[]>([]);
  const [joined, setJoined] = useState<JoinedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/live");
      const json = (await res.json()) as { ok: boolean; hosted?: HostedSession[]; joined?: JoinedSession[] };
      if (json.ok) {
        setHosted(json.hosted ?? []);
        setJoined(json.joined ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function createSession() {
    setCreating(true);
    try {
      const res = await fetch("/api/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title || undefined }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        session?: { code: string; alreadyLive?: boolean };
        error?: string;
      };
      if (json.ok && json.session) {
        toast({
          title: json.session.alreadyLive ? "Session déjà active" : "Session live créée",
          description: "Vous allez entrer dans le salon — cliquez « Partager mon écran » pour diffuser.",
        });
        router.push(`/live/${json.session.code}`);
      } else {
        toast({ title: "Création refusée", description: json.error, variant: "destructive" });
      }
    } finally {
      setCreating(false);
    }
  }

  async function joinByCode() {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    router.push(`/live/${encodeURIComponent(code)}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mode live</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-400">
          Partagez votre écran en temps réel : créez une session, envoyez le code ou le lien, et
          diffusez. Vos spectateurs voient votre écran en direct — idéal pour présenter l&apos;exécution
          d&apos;une tâche, un agent en action, ou faire une revue à plusieurs.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <div className="flex items-center gap-2">
            <MonitorUp className="h-5 w-5 text-emerald-400" />
            <h2 className="font-semibold text-zinc-100">Démarrer une diffusion</h2>
          </div>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre de la session (optionnel) — ex. Revue de l'agent Analyste"
            className="bg-zinc-950 border-zinc-800"
          />
          <Button onClick={() => void createSession()} disabled={creating} className="w-full bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
            Créer la session live
          </Button>
        </div>

        <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <div className="flex items-center gap-2">
            <PlayCircle className="h-5 w-5 text-emerald-400" />
            <h2 className="font-semibold text-zinc-100">Rejoindre avec un code</h2>
          </div>
          <Input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Ex. 7XK-Q2M"
            className="bg-zinc-950 border-zinc-800 font-mono uppercase"
          />
          <Button onClick={() => void joinByCode()} disabled={!joinCode.trim()} variant="outline" className="w-full">
            Rejoindre la diffusion <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-zinc-500">
              Mes sessions ({hosted.length})
            </h2>
            {hosted.length === 0 ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 text-center text-sm text-zinc-400">
                Aucune session. Créez votre première diffusion.
              </div>
            ) : (
              <div className="space-y-3">
                {hosted.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => router.push(`/live/${s.code}`)}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-left transition-colors hover:border-zinc-600"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Radio className={`h-4 w-4 ${s.status === "LIVE" ? "text-red-500" : "text-zinc-600"}`} />
                        <span className="font-medium text-zinc-100">{s.title ?? "Session sans titre"}</span>
                        {s.status === "LIVE" && (
                          <Badge variant="outline" className="border-red-800/60 text-red-300">EN DIRECT</Badge>
                        )}
                      </div>
                      <code className="text-xs text-zinc-500">{s.code}</code>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
                      <span>{s.viewerCount} spectateur{s.viewerCount > 1 ? "s" : ""}</span>
                      <span>{new Date(s.createdAt).toLocaleString("fr-FR")}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-zinc-500">
              Sessions rejointes ({joined.length})
            </h2>
            {joined.length === 0 ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 text-center text-sm text-zinc-400">
                Vous n&apos;avez rejoint aucune session.
              </div>
            ) : (
              <div className="space-y-3">
                {joined.map((j) => (
                  <button
                    key={j.participantId}
                    onClick={() => router.push(`/live/${j.code}`)}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-left transition-colors hover:border-zinc-600"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <PlayCircle className={`h-4 w-4 ${j.status === "LIVE" ? "text-emerald-400" : "text-zinc-600"}`} />
                        <span className="font-medium text-zinc-100">{j.title ?? "Session sans titre"}</span>
                      </div>
                      <span className="text-xs text-zinc-500">hôte : {j.host}</span>
                    </div>
                    <code className="mt-1 block text-xs text-zinc-600">{j.code}</code>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
