"use client";

/**
 * GatewaySection — Action Gateway (v4.3, ADR-0017).
 *
 * Trois vues :
 * 1. EXÉCUTIONS — historique complet (risque, statut, vérification,
 *    chaîne de trace) + approbation/refus des demandes de confirmation
 *    (HITL au niveau action, avec permission mémorisée optionnelle) ;
 * 2. PERMISSIONS — gestion des autorisations par app/action (motifs,
 *    effet, plafond de risque, expiration) ;
 * 3. DÉCOUVERTE — recherche d'apps/actions en langage naturel (la même
 *    que celle du planificateur d'agents).
 */

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import {
  ShieldCheck,
  History,
  Search,
  Loader2,
  RefreshCw,
  Trash2,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Bot,
  User,
  ChevronRight,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Types (miroir des réponses API)
// ─────────────────────────────────────────────────────────────

type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type ExecStatus =
  | "PENDING" | "CONFIRMATION_REQUIRED" | "RUNNING" | "SUCCESS"
  | "VERIFIED" | "FAILED" | "REJECTED" | "EXPIRED";

interface ExecutionItem {
  id: string;
  appSlug: string;
  actionSlug: string;
  provider: string;
  status: ExecStatus;
  riskLevel: RiskLevel;
  riskScore: number | null;
  agentId: string | null;
  taskId: string | null;
  planId: string | null;
  stepIndex: number | null;
  error: string | null;
  httpStatus: number | null;
  latencyMs: number | null;
  verified: boolean;
  createdAt: string;
  completedAt: string | null;
}

interface VerificationCheck { name: string; pass: boolean; detail: string }
interface VerificationReport {
  verified: boolean;
  strategy: string;
  confidence: number;
  checks: VerificationCheck[];
  evidence: string[];
}

interface ExecutionDetail extends ExecutionItem {
  riskReasons: string[];
  permission: { decision: string; floor: string; source: string; reason: string } | null;
  paramsRedacted: Record<string, unknown> | null;
  resultSummary: string | null;
  resultData: unknown;
  verification: VerificationReport | null;
  connectionId: string | null;
  requestId: string | null;
  confirmedBy: string | null;
}

interface PermissionItem {
  id: string;
  appSlug: string;
  actionPattern: string;
  effect: "ALLOW" | "DENY";
  riskFloor: RiskLevel;
  source: string;
  note: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface DiscoveredApp {
  slug: string;
  name: string;
  logo: string;
  category: string;
  description: string;
  toolCount: number;
  score: number;
  native: boolean;
  connected: boolean;
}

interface DiscoveredTool {
  key: string;
  appSlug: string;
  appName: string;
  actionSlug: string;
  name: string;
  description: string;
  risk: RiskLevel;
  local: boolean;
}

// ─────────────────────────────────────────────────────────────
// Badges risque / statut
// ─────────────────────────────────────────────────────────────

const RISK_CLS: Record<RiskLevel, string> = {
  LOW: "border-emerald-700/50 text-emerald-300",
  MEDIUM: "border-yellow-700/50 text-yellow-300",
  HIGH: "border-orange-700/60 text-orange-300",
  CRITICAL: "border-red-800/70 text-red-300",
};

const STATUS_CLS: Record<ExecStatus, string> = {
  PENDING: "border-zinc-700 text-zinc-400",
  CONFIRMATION_REQUIRED: "border-orange-600/70 text-orange-300",
  RUNNING: "border-blue-700/50 text-blue-300",
  SUCCESS: "border-emerald-700/50 text-emerald-300",
  VERIFIED: "border-emerald-600/70 text-emerald-200",
  FAILED: "border-red-800/60 text-red-300",
  REJECTED: "border-zinc-700 text-zinc-500",
  EXPIRED: "border-zinc-700 text-zinc-500",
};

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}min`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}j`;
}

// ─────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────

export function GatewaySection() {
  const { toast } = useToast();
  const { t } = useI18n();

  return (
    <Card className="bg-zinc-900/40 border-zinc-800">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-800 border border-zinc-700">
            <ShieldCheck className="h-4.5 w-4.5 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-sm text-zinc-100">{t("gateway.title")}</h2>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed max-w-3xl">{t("gateway.desc")}</p>
          </div>
        </div>

        <Tabs defaultValue="executions">
          <TabsList className="bg-zinc-950 border border-zinc-800 h-9">
            <TabsTrigger value="executions" className="text-xs gap-1.5 data-[state=active]:bg-zinc-800">
              <History className="h-3.5 w-3.5" /> {t("gateway.tab.executions")}
            </TabsTrigger>
            <TabsTrigger value="permissions" className="text-xs gap-1.5 data-[state=active]:bg-zinc-800">
              <ShieldCheck className="h-3.5 w-3.5" /> {t("gateway.tab.permissions")}
            </TabsTrigger>
            <TabsTrigger value="discovery" className="text-xs gap-1.5 data-[state=active]:bg-zinc-800">
              <Search className="h-3.5 w-3.5" /> {t("gateway.tab.discovery")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="executions" className="mt-4">
            <ExecutionsTab />
          </TabsContent>
          <TabsContent value="permissions" className="mt-4">
            <PermissionsTab />
          </TabsContent>
          <TabsContent value="discovery" className="mt-4">
            <DiscoveryTab />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────
// Onglet 1 : Exécutions + confirmations
// ─────────────────────────────────────────────────────────────

function ExecutionsTab() {
  const { toast } = useToast();
  const { t } = useI18n();
  const [items, setItems] = useState<ExecutionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<ExecutionDetail | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [remember, setRemember] = useState<string>("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/connectors/executions?limit=30");
      const json = (await res.json()) as { ok: boolean; executions?: ExecutionItem[] };
      if (json.ok && json.executions) setItems(json.executions);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Les demandes de confirmation expirent (TTL) : rafraîchissement léger.
    const timer = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const pending = items.filter((i) => i.status === "CONFIRMATION_REQUIRED");

  async function resolve(id: string, approved: boolean) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/connectors/executions/${id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approved,
          ...(approved && remember ? { remember } : {}),
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string; executionStatus?: string };
      if (json.ok || json.executionStatus) {
        toast({
          title: t("gateway.exec.confirmed"),
          description: approved
            ? t("gateway.exec.confirmedDesc", { status: json.executionStatus ?? "?" })
            : t("gateway.exec.rejectedDesc"),
        });
      } else {
        toast({ title: t("gateway.exec.confirmError"), description: json.error, variant: "destructive" });
      }
      setRemember("");
      await refresh();
    } catch (err) {
      toast({ title: t("gateway.exec.confirmError"), description: String(err), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  async function openDetail(id: string) {
    const res = await fetch(`/api/connectors/executions/${id}`);
    const json = (await res.json()) as { ok: boolean; execution?: ExecutionDetail };
    if (json.ok && json.execution) setDetail(json.execution);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        {pending.length > 0 ? (
          <Badge variant="outline" className="border-orange-600/70 text-orange-300 text-[11px]">
            <ShieldAlert className="h-3 w-3 mr-1.5" />
            {t("gateway.pending", { count: pending.length })}
          </Badge>
        ) : (
          <span className="text-[11px] text-zinc-600" />
        )}
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void refresh()}>
          <RefreshCw className="h-3 w-3 mr-1.5" /> {t("gateway.refresh")}
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 bg-zinc-800/60" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-zinc-500 py-6 text-center">{t("gateway.exec.empty")}</p>
      ) : (
        <div className="rounded-lg border border-zinc-800 divide-y divide-zinc-800/60 max-h-96 overflow-y-auto">
          {items.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 hover:bg-zinc-900/60">
              <span className="text-xs font-mono text-zinc-200 min-w-0 truncate max-w-[280px]">
                {e.appSlug}<span className="text-zinc-600">.</span>
                <span className="text-zinc-400">{e.actionSlug}</span>
              </span>

              <Badge variant="outline" className={`text-[10px] shrink-0 ${RISK_CLS[e.riskLevel]}`}>
                {t(`gateway.risk.${e.riskLevel}` as TranslationKey)}
                {e.riskScore !== null ? <span className="ml-1 opacity-60">{e.riskScore}</span> : null}
              </Badge>

              <Badge variant="outline" className={`text-[10px] shrink-0 ${STATUS_CLS[e.status]}`}>
                {t(`gateway.status.${e.status}` as TranslationKey)}
              </Badge>

              {e.verified && (
                <Badge variant="outline" className="text-[10px] border-emerald-700/50 text-emerald-300 shrink-0 gap-1">
                  <CheckCircle2 className="h-2.5 w-2.5" /> {t("gateway.exec.verified")}
                </Badge>
              )}

              <span className="text-[10px] text-zinc-500 shrink-0 inline-flex items-center gap-1">
                {e.agentId ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
                {e.agentId ? t("gateway.exec.agent") : t("gateway.exec.manual")}
              </span>

              <span className="text-[10px] text-zinc-600 shrink-0">{timeAgo(e.createdAt)}</span>

              <div className="ml-auto flex items-center gap-1.5">
                {e.status === "CONFIRMATION_REQUIRED" && (
                  <>
                    <Button
                      size="sm"
                      className="h-7 text-[11px] px-2.5 bg-emerald-700 hover:bg-emerald-600"
                      disabled={busyId === e.id}
                      onClick={() => void resolve(e.id, true)}
                    >
                      {busyId === e.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                      {t("gateway.exec.confirm")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px] px-2.5 border-red-800/60 text-red-300 hover:text-red-200"
                      disabled={busyId === e.id}
                      onClick={() => void resolve(e.id, false)}
                    >
                      <XCircle className="h-3 w-3 mr-1" /> {t("gateway.exec.reject")}
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[11px] px-2"
                  onClick={() => void openDetail(e.id)}
                >
                  <ChevronRight className="h-3 w-3" /> {t("gateway.exec.detail")}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {pending.length > 0 && (
        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
          <Label className="text-[11px] shrink-0">{t("gateway.exec.remember", { app: pending[0].appSlug })}</Label>
          <select
            value={remember}
            onChange={(ev) => setRemember(ev.target.value)}
            className="h-7 rounded-md border border-zinc-800 bg-zinc-950 px-2 text-[11px] text-zinc-300"
          >
            <option value="">{t("gateway.exec.noRemember")}</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
            <option value="CRITICAL">CRITICAL</option>
          </select>
          <span className="hidden sm:inline">{t("gateway.exec.rememberHint")}</span>
        </div>
      )}

      <ExecutionDetailDialog detail={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function ExecutionDetailDialog({ detail, onClose }: { detail: ExecutionDetail | null; onClose: () => void }) {
  const { t } = useI18n();
  if (!detail) return null;
  const checks = detail.verification?.checks ?? [];
  const passed = checks.filter((c) => c.pass).length;

  return (
    <Dialog open={!!detail} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">
            {detail.appSlug}.{detail.actionSlug}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={`text-[10px] ${RISK_CLS[detail.riskLevel]}`}>
              {t(`gateway.risk.${detail.riskLevel}` as TranslationKey)}
            </Badge>
            <Badge variant="outline" className={`text-[10px] ${STATUS_CLS[detail.status]}`}>
              {t(`gateway.status.${detail.status}` as TranslationKey)}
            </Badge>
            <span className="text-[10px] text-zinc-500 font-mono">{detail.provider}</span>
            {detail.latencyMs !== null && <span className="text-[10px] text-zinc-500">{detail.latencyMs} ms</span>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-xs">
          {detail.error && (
            <p className="text-red-300/90 flex items-start gap-1.5">
              <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {detail.error}
            </p>
          )}

          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
              {t("gateway.detail.riskTitle")} ({detail.riskScore ?? "?"}/100)
            </h4>
            <ul className="space-y-0.5">
              {detail.riskReasons.map((r, i) => (
                <li key={i} className="text-zinc-400 flex gap-1.5">
                  <span className="text-zinc-600">•</span> {r}
                </li>
              ))}
              <li className="text-zinc-600">{t("gateway.detail.source", { source: "risk-engine" })}</li>
            </ul>
          </section>

          {detail.permission && (
            <section>
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                {t("gateway.detail.permissionTitle")}
              </h4>
              <p className="text-zinc-400">
                <span className="font-mono text-zinc-300">{detail.permission.decision}</span>
                {" — "}
                {detail.permission.reason}
              </p>
              <p className="text-zinc-600 mt-0.5 font-mono text-[10px]">
                floor={detail.permission.floor} · source={detail.permission.source}
              </p>
            </section>
          )}

          {detail.paramsRedacted && Object.keys(detail.paramsRedacted).length > 0 && (
            <section>
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                {t("gateway.detail.paramsTitle")}
              </h4>
              <pre className="rounded-md border border-zinc-800 bg-zinc-950 p-2.5 text-[10px] text-zinc-400 max-h-32 overflow-auto whitespace-pre-wrap break-all">
                {JSON.stringify(detail.paramsRedacted, null, 2)}
              </pre>
            </section>
          )}

          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
              {t("gateway.detail.verificationTitle")}
            </h4>
            {!detail.verification ? (
              <p className="text-zinc-500">{t("gateway.detail.noVerification")}</p>
            ) : (
              <div className="space-y-1">
                <p className="text-zinc-400">
                  {t("gateway.detail.checks", { passed, total: checks.length })}{" "}
                  <span className="text-zinc-600 font-mono">({detail.verification.strategy})</span>
                </p>
                {checks.map((c, i) => (
                  <p key={i} className="flex items-start gap-1.5 text-zinc-400">
                    {c.pass ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" />
                    ) : (
                      <XCircle className="h-3 w-3 text-red-400 mt-0.5 shrink-0" />
                    )}
                    <span>
                      <span className="text-zinc-300 font-mono text-[10px]">{c.name}</span> — {c.detail}
                    </span>
                  </p>
                ))}
                {detail.verification.evidence.length > 0 && (
                  <p className="text-zinc-500 text-[10px] pt-1">
                    {t("gateway.detail.evidence")} : {detail.verification.evidence.join(" · ")}
                  </p>
                )}
              </div>
            )}
          </section>

          {(detail.resultSummary !== null || detail.resultData !== null) && (
            <section>
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                {t("gateway.detail.resultTitle")}
              </h4>
              {detail.resultSummary && (
                <pre className="rounded-md border border-zinc-800 bg-zinc-950 p-2.5 text-[10px] text-zinc-400 max-h-40 overflow-auto whitespace-pre-wrap break-all">
                  {detail.resultSummary}
                </pre>
              )}
            </section>
          )}

          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
              {t("gateway.detail.traceTitle")}
            </h4>
            <p className="text-zinc-500 font-mono text-[10px] break-all leading-relaxed">
              {detail.requestId && <>requestId={detail.requestId}{"\n"}</>}
              {detail.taskId && <>taskId={detail.taskId}{"\n"}</>}
              {detail.planId && <>planId={detail.planId} (étape {(detail.stepIndex ?? 0) + 1}){"\n"}</>}
              {detail.agentId && <>agentId={detail.agentId}{"\n"}</>}
              {detail.connectionId && <>connectionId={detail.connectionId}</>}
            </p>
          </section>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("common.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────
// Onglet 2 : Permissions
// ─────────────────────────────────────────────────────────────

function PermissionsTab() {
  const { toast } = useToast();
  const { t } = useI18n();
  const [items, setItems] = useState<PermissionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [appSlug, setAppSlug] = useState("");
  const [pattern, setPattern] = useState("*");
  const [effect, setEffect] = useState<"ALLOW" | "DENY">("ALLOW");
  const [floor, setFloor] = useState<RiskLevel>("HIGH");
  const [expiresIn, setExpiresIn] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/connectors/permissions");
      const json = (await res.json()) as { ok: boolean; permissions?: PermissionItem[] };
      if (json.ok && json.permissions) setItems(json.permissions);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function addPermission() {
    if (!appSlug.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/connectors/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appSlug: appSlug.trim(),
          actionPattern: pattern.trim() || "*",
          effect,
          riskFloor: floor,
          note: note.trim() || undefined,
          ...(expiresIn && Number(expiresIn) > 0 ? { expiresInDays: Number(expiresIn) } : {}),
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (json.ok) {
        toast({ title: t("gateway.perm.created") });
        setAppSlug("");
        setPattern("*");
        setNote("");
        setExpiresIn("");
        await refresh();
      } else {
        toast({ title: t("gateway.perm.invalid"), description: json.error, variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/connectors/permissions/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast({ title: t("gateway.perm.removed") });
      await refresh();
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500 leading-relaxed">{t("gateway.perm.desc")}</p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5 rounded-lg border border-zinc-800 p-3 bg-zinc-950/40">
        <div className="space-y-1">
          <Label className="text-[11px]">{t("gateway.perm.app")}</Label>
          <Input
            value={appSlug}
            onChange={(e) => setAppSlug(e.target.value)}
            placeholder={t("gateway.perm.appPlaceholder")}
            className="h-8 text-xs font-mono"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">{t("gateway.perm.pattern")}</Label>
          <Input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="github.*"
            className="h-8 text-xs font-mono"
          />
          <p className="text-[10px] text-zinc-600">{t("gateway.perm.patternHint")}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[11px]">{t("gateway.perm.effect")}</Label>
            <select
              value={effect}
              onChange={(e) => setEffect(e.target.value as "ALLOW" | "DENY")}
              className="w-full h-8 rounded-md border border-zinc-800 bg-zinc-950 px-2 text-xs text-zinc-200"
            >
              <option value="ALLOW">ALLOW</option>
              <option value="DENY">DENY</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">{t("gateway.perm.floor")}</Label>
            <select
              value={floor}
              onChange={(e) => setFloor(e.target.value as RiskLevel)}
              className="w-full h-8 rounded-md border border-zinc-800 bg-zinc-950 px-2 text-xs text-zinc-200"
            >
              {(["LOW", "MEDIUM", "HIGH", "CRITICAL"] as RiskLevel[]).map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">{t("gateway.perm.expiresIn")}</Label>
          <Input
            value={expiresIn}
            onChange={(e) => setExpiresIn(e.target.value.replace(/\D/g, ""))}
            placeholder="30"
            className="h-8 text-xs"
            inputMode="numeric"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">{t("gateway.perm.note")}</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} className="h-8 text-xs" />
        </div>
        <div className="flex items-end">
          <Button size="sm" className="h-8 text-xs" disabled={!appSlug.trim() || saving} onClick={() => void addPermission()}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />}
            {t("gateway.perm.add")}
          </Button>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-20 bg-zinc-800/60" />
      ) : items.length === 0 ? (
        <p className="text-xs text-zinc-500 py-4 text-center">{t("gateway.perm.empty")}</p>
      ) : (
        <div className="rounded-lg border border-zinc-800 divide-y divide-zinc-800/60">
          {items.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              <span className="text-xs font-mono text-zinc-200">
                {p.appSlug === "*" ? "*" : p.appSlug}
                <span className="text-zinc-600"> · </span>
                <span className="text-zinc-400">{p.actionPattern}</span>
              </span>
              <Badge
                variant="outline"
                className={`text-[10px] ${
                  p.effect === "DENY"
                    ? "border-red-800/60 text-red-300"
                    : "border-emerald-700/50 text-emerald-300"
                }`}
              >
                {p.effect}
              </Badge>
              {p.effect === "ALLOW" && (
                <Badge variant="outline" className={`text-[10px] ${RISK_CLS[p.riskFloor]}`}>
                  ≤ {p.riskFloor}
                </Badge>
              )}
              <span className="text-[10px] text-zinc-600">
                {p.expiresAt ? new Date(p.expiresAt).toLocaleDateString() : t("gateway.perm.permanent")}
              </span>
              {p.note && <span className="text-[10px] text-zinc-500 truncate max-w-[240px]">{p.note}</span>}
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-7 text-[11px] text-red-300 hover:text-red-200"
                onClick={() => void remove(p.id)}
              >
                <Trash2 className="h-3 w-3 mr-1" /> {t("gateway.perm.delete")}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Onglet 3 : Découverte
// ─────────────────────────────────────────────────────────────

function DiscoveryTab() {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [apps, setApps] = useState<DiscoveredApp[] | null>(null);
  const [tools, setTools] = useState<DiscoveredTool[] | null>(null);

  async function search() {
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/connectors/discover?q=${encodeURIComponent(query.trim())}`);
      const json = (await res.json()) as {
        ok: boolean;
        apps?: DiscoveredApp[];
        tools?: DiscoveredTool[];
      };
      if (json.ok) {
        setApps(json.apps ?? []);
        setTools(json.tools ?? []);
      }
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500 leading-relaxed">{t("gateway.disc.desc")}</p>

      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void search()}
          placeholder={t("gateway.disc.placeholder")}
          className="h-9 text-xs"
        />
        <Button size="sm" className="h-9 text-xs shrink-0" disabled={searching || query.trim().length < 2} onClick={() => void search()}>
          {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5 mr-1.5" />}
          {t("gateway.disc.search")}
        </Button>
      </div>

      {apps === null ? (
        <p className="text-xs text-zinc-500 py-4 text-center">{t("gateway.disc.empty")}</p>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">
              {t("gateway.disc.apps")}
            </h4>
            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {apps.map((a) => (
                <div
                  key={a.slug}
                  className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950/40 px-2.5 py-2"
                >
                  <span className="text-sm shrink-0">{a.logo || "🔌"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-zinc-200 truncate">
                      {a.name} <span className="text-zinc-600 font-mono text-[10px]">{a.slug}</span>
                    </p>
                    <p className="text-[10px] text-zinc-600 truncate">
                      {t("gateway.disc.toolsCount", { count: a.toolCount })}
                      {a.native ? ` · ${t("gateway.disc.native")}` : ""}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[10px] shrink-0 ${
                      a.connected
                        ? "border-emerald-700/50 text-emerald-300"
                        : "border-zinc-700 text-zinc-500"
                    }`}
                  >
                    {a.connected ? t("gateway.disc.connected") : t("gateway.disc.notConnected")}
                  </Badge>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">
              {t("gateway.disc.tools")}
            </h4>
            {(tools ?? []).length === 0 ? (
              <p className="text-xs text-zinc-500 py-4 text-center">{t("gateway.disc.noTools")}</p>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {(tools ?? []).map((tool) => (
                  <div
                    key={tool.key}
                    className="rounded-md border border-zinc-800 bg-zinc-950/40 px-2.5 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-zinc-300 truncate flex-1">
                        {tool.appSlug}<span className="text-zinc-600">.</span>
                        <span className="text-zinc-400">{tool.actionSlug}</span>
                      </span>
                      <Badge variant="outline" className={`text-[10px] shrink-0 ${RISK_CLS[tool.risk]}`}>
                        {tool.risk}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-zinc-500 truncate mt-0.5">{tool.description}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
