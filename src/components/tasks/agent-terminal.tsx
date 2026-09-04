"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { usePolling, apiPatch, formatDate } from "@/lib/client/hooks";
import { TerminalSquare, ShieldCheck, Loader2, CircleStop, ChevronRight, Clock, CheckCircle2, XCircle } from "lucide-react";

/**
 * Terminal intégré — vue UTILISATEUR (lecture seule).
 *
 * Les agents IA exécutent leurs commandes via le dispatch d'outils du
 * moteur (sandbox, HITL, audit) ; l'humain observe en temps réel ce que
 * font les agents : commandes, sorties, codes de retour, durées.
 * Aucune saisie n'est possible — par conception.
 */

interface TerminalCommandRow {
  id: string
  command: string
  exitCode: number | null
  stdout: string
  stderr: string
  truncated: boolean
  durationMs: number
  timedOut: boolean
  approved: boolean
  createdAt: string
}

interface SessionsResponse {
  sessions: {
    id: string
    taskId: string | null
    agentId: string | null
    status: string
    createdAt: string
    commandCount: number
  }[]
}

interface CommandsResponse {
  sessionId: string
  commands: TerminalCommandRow[]
}

export function AgentTerminal({ taskId }: { taskId: string }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: sessionsData, loading: sessionsLoading } = usePolling<SessionsResponse>(
    `/api/terminal?taskId=${taskId}`,
    4000
  );
  const sessions = sessionsData?.sessions ?? [];
  const activeSession = selectedSession ?? sessions[0]?.id ?? null;

  const { data: commandsData, loading: commandsLoading } = usePolling<CommandsResponse | null>(
    activeSession ? `/api/terminal?sessionId=${activeSession}` : null,
    3000
  );
  const commands = commandsData?.commands ?? [];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [commands.length, activeSession]);

  async function closeSession() {
    if (!activeSession) return;
    setClosing(true);
    const res = await apiPatch(`/api/terminal/sessions/${activeSession}`, {});
    setClosing(false);
    if (!res.ok) {
      toast({ title: t("terminal.errors.closeFailed"), variant: "destructive" });
      return;
    }
    toast({ title: t("terminal.sessionClosed") });
    setSelectedSession(null);
  }

  if (sessionsLoading) {
    return <Skeleton className="h-64 w-full bg-zinc-800/60" />;
  }

  return (
    <Card className="border-emerald-500/25 bg-zinc-950/95 shadow-xl overflow-hidden">
      <CardHeader className="pb-3 border-b border-zinc-800 bg-zinc-900/60">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base text-zinc-100 flex items-center gap-2">
            <TerminalSquare className="h-5 w-5 text-emerald-400" />
            {t("terminal.title")}
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 text-[10px] gap-1">
              <ShieldCheck className="h-3 w-3" /> {t("terminal.agentsOnly")}
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            {sessions.length > 1 && (
              <select
                value={activeSession ?? ""}
                onChange={(e) => setSelectedSession(e.target.value)}
                className="h-8 rounded-md border border-zinc-800 bg-zinc-950 px-2 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                aria-label={t("terminal.sessionSelect")}
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.status === "ACTIVE" ? "● " : "○ "}
                    {s.commandCount} {t("terminal.commandsCount")}
                  </option>
                ))}
              </select>
            )}
            {sessions.some((s) => s.status === "ACTIVE") && (
              <Button
                size="sm"
                variant="outline"
                onClick={closeSession}
                disabled={closing}
                className="h-8 text-xs border-zinc-700 hover:border-orange-500/40 hover:text-orange-300"
              >
                {closing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CircleStop className="h-3.5 w-3.5" />}
                <span className="ml-1.5">{t("terminal.closeSession")}</span>
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-zinc-500 flex items-center gap-1.5 mt-1">
          <ShieldCheck className="h-3 w-3 text-emerald-500/70" />
          {t("terminal.readonlyHint")}
        </p>
      </CardHeader>

      <CardContent className="p-0">
        {sessions.length === 0 ? (
          <div className="py-16 text-center text-zinc-500">
            <TerminalSquare className="h-10 w-10 mx-auto mb-3 text-zinc-700" />
            <p className="text-sm">{t("terminal.empty")}</p>
            <p className="text-xs text-zinc-600 mt-1.5 max-w-md mx-auto">{t("terminal.emptyDesc")}</p>
          </div>
        ) : (
          <div ref={scrollRef} className="bg-zinc-950 font-mono text-xs max-h-[480px] overflow-y-auto">
            {commandsLoading && commands.length === 0 ? (
              <div className="p-4 text-zinc-600">{t("terminal.loading")}</div>
            ) : commands.length === 0 ? (
              <div className="p-4 text-zinc-600">{t("terminal.noCommands")}</div>
            ) : (
              commands.map((cmd) => (
                <div key={cmd.id} className="border-b border-zinc-900/70 last:border-0">
                  <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900/40 sticky top-0 backdrop-blur-sm">
                    <ChevronRight className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    <code className="text-emerald-300 truncate flex-1">{cmd.command}</code>
                    <span className="flex items-center gap-2 text-[10px] text-zinc-500 shrink-0">
                      {cmd.timedOut ? (
                        <span className="flex items-center gap-1 text-orange-400"><Clock className="h-3 w-3" /> timeout</span>
                      ) : cmd.exitCode === 0 ? (
                        <span className="flex items-center gap-1 text-emerald-500/80"><CheckCircle2 className="h-3 w-3" /> exit 0</span>
                      ) : (
                        <span className="flex items-center gap-1 text-red-400"><XCircle className="h-3 w-3" /> exit {cmd.exitCode ?? "?"}</span>
                      )}
                      <span>{(cmd.durationMs / 1000).toFixed(1)}s</span>
                      <span className="text-zinc-600">{formatDate(cmd.createdAt)}</span>
                    </span>
                  </div>
                  {cmd.stdout && (
                    <pre className="px-4 py-2 text-zinc-300 whitespace-pre-wrap break-words leading-relaxed">
                      {cmd.stdout}
                      {cmd.truncated && <span className="text-orange-400 block mt-1">[{t("terminal.outputTruncated")}]</span>}
                    </pre>
                  )}
                  {cmd.stderr && (
                    <pre className="px-4 py-2 text-red-300/90 whitespace-pre-wrap break-words leading-relaxed bg-red-950/10">
                      {cmd.stderr}
                    </pre>
                  )}
                  {!cmd.stdout && !cmd.stderr && (
                    <div className="px-4 py-2 text-zinc-600 italic">{t("terminal.noOutput")}</div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
