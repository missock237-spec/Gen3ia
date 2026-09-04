/**
 * Terminal intégré GEN3IA — réservé aux agents IA (v4.1).
 *
 * OBJECTIF : donner aux agents du projet un terminal réel, persistant et
 * observable, SANS jamais l'exposer aux utilisateurs finaux. Les humains
 * obtiennent une vue en lecture seule (transparence et audit) via
 * /api/terminal — l'exécution passe EXCLUSIVEMENT par le dispatch d'outils
 * du moteur d'agents (runTool → "terminal"), jamais par une route HTTP
 * utilisateur.
 *
 * SÉCURITÉ (défense en profondeur, cf. ADR-0005 sandbox) :
 * - environnement épuré : PATH, HOME, LANG, TZ uniquement (aucun secret
 *   process.env ne traverse la frontière du terminal) ;
 * - répertoire de travail isolé par session (os.tmpdir()/gen3ia-terminal) ;
 * - timeout strict (30 s par défaut, 120 s max) avec kill du groupe ;
 * - sortie plafonnée (64 Ko) — le tronqué est marqué ;
 * - blocklist de commandes destructrices (rm -rf /, mkfs, shutdown…) ;
 * - HITL : l'outil est marqué « dangerous » → l'executor exige
 *   l'approbation humaine quand les préférences utilisateur l'activent ;
 * - chaque commande est persistée (audit) avec sa sortie et sa durée.
 */

import { spawn } from "node:child_process"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { db } from "@/lib/db"
import { logger } from "@/lib/observability/logger"
import { appendAuditEntry } from "@/lib/security/audit-chain"

// ─────────────────────────────────────────────────────────────
// Constantes et limites
// ─────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000
const MAX_TIMEOUT_MS = 120_000
const MAX_OUTPUT_BYTES = 64 * 1024
const MAX_COMMAND_LENGTH = 2000
const SHELL = process.env.GEN3IA_TERMINAL_SHELL ?? "bash"

/**
 * Motifs destructeurs interdits d'exécution, quel que soit le contexte.
 * L'objectif n'est PAS d'émuler un antivirus — le HITL reste le garde-fou
 * principal — mais d'arrêter net les commandes catastrophiques évidentes.
 */
const DESTRUCTIVE_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\brm\s+[^;|&]*\s-(?:[a-z]*r[a-z]*f|f[a-z]*r)[a-z]*\b\s+(?:\/|~|\$HOME|\/\*)/i, reason: "suppression récursive d'un répertoire racine" },
  { re: /\b(?:mkfs(?:\.\w+)?|fdisk|parted|sfdisk)\b/i, reason: "manipulation de système de fichiers/périphériques" },
  { re: /\b(?:shutdown|reboot|halt|poweroff|init\s+[06])\b/i, reason: "arrêt/redémarrage du système" },
  { re: /\bdd\s+[^;|&]*\bof=\/dev\//i, reason: "écriture brute sur un périphérique" },
  { re: />\s*\/dev\/sd[a-z]/i, reason: "écriture directe sur un disque" },
  { re: /:\(\)\{.*\};\s*:/, reason: "fork bomb" },
  { re: /\b(?:chmod|chown)\s+(?:-R\s+)?(?:777|000)\s+\/(?:\s|$)/i, reason: "permissions système altérées à la racine" },
  { re: /\bcurl\b[^;|&]*\|\s*(?:ba)?sh\b|\bwget\b[^;|&]*\|\s*(?:ba)?sh\b/i, reason: "exécution d'un script distant téléchargé" },
  { re: /\bsudo\b/i, reason: "escalade de privilèges (sudo indisponible dans le terminal agent)" },
]

export interface TerminalExecArgs {
  command: string
  /** Délai en ms (30 000 par défaut, 120 000 max). */
  timeoutMs?: number
  /** Identifiant de session à réutiliser (créée sinon). */
  sessionId?: string
  /** Répertoire relatif de travail dans la sandbox de session. */
  workdir?: string
}

export interface TerminalExecResult {
  ok: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  truncated: boolean
  durationMs: number
  sessionId: string
  commandId: string
  timedOut: boolean
}

export interface TerminalSessionView {
  id: string
  taskId: string | null
  agentId: string | null
  userId: string
  status: string
  createdAt: string
  closedAt: string | null
  commandCount: number
}

export interface TerminalCommandView {
  id: string
  sessionId: string
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

// ─────────────────────────────────────────────────────────────
// Sessions
// ─────────────────────────────────────────────────────────────

/** Crée (ou réutilise) la session terminal d'une tâche. */
export async function ensureTerminalSession(
  userId: string,
  taskId: string | null,
  agentId: string | null
): Promise<{ id: string; workdir: string }> {
  if (taskId) {
    const existing = await db.terminalSession.findFirst({
      where: { taskId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    })
    if (existing) return { id: existing.id, workdir: existing.workdir }
  }
  const workdir = await mkdtemp(path.join(tmpdir(), "gen3ia-terminal-"))
  const session = await db.terminalSession.create({
    data: { userId, taskId, agentId, workdir, status: "ACTIVE" },
  })
  logger.info("terminal: session créée", { sessionId: session.id, taskId, agentId })
  return { id: session.id, workdir }
}

/** Liste les sessions d'un utilisateur (filtrable par tâche). */
export async function listTerminalSessions(
  userId: string,
  taskId?: string | null
): Promise<TerminalSessionView[]> {
  const rows = await db.terminalSession.findMany({
    where: { userId, ...(taskId ? { taskId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { _count: { select: { commands: true } } },
  })
  return rows.map((r) => ({
    id: r.id,
    taskId: r.taskId,
    agentId: r.agentId,
    userId: r.userId,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    closedAt: r.closedAt?.toISOString() ?? null,
    commandCount: r._count.commands,
  }))
}

/** Historique des commandes d'une session (vue lecture seule utilisateur). */
export async function listSessionCommands(
  userId: string,
  sessionId: string
): Promise<TerminalCommandView[]> {
  const session = await db.terminalSession.findFirst({
    where: { id: sessionId, userId },
  })
  if (!session) return []
  const rows = await db.terminalCommand.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    take: 500,
  })
  return rows.map(commandToView)
}

function commandToView(r: {
  id: string
  sessionId: string
  command: string
  exitCode: number | null
  stdout: string
  stderr: string
  truncated: boolean
  durationMs: number
  timedOut: boolean
  approved: boolean
  createdAt: Date
}): TerminalCommandView {
  return {
    id: r.id,
    sessionId: r.sessionId,
    command: r.command,
    exitCode: r.exitCode,
    stdout: r.stdout,
    stderr: r.stderr,
    truncated: r.truncated,
    durationMs: r.durationMs,
    timedOut: r.timedOut,
    approved: r.approved,
    createdAt: r.createdAt.toISOString(),
  }
}

/** Clôture propre d'une session (sandbox conservée pour audit). */
export async function closeTerminalSession(userId: string, sessionId: string): Promise<boolean> {
  const session = await db.terminalSession.findFirst({ where: { id: sessionId, userId } })
  if (!session || session.status !== "ACTIVE") return false
  await db.terminalSession.update({
    where: { id: session.id },
    data: { status: "CLOSED", closedAt: new Date() },
  })
  return true
}

// ─────────────────────────────────────────────────────────────
// Validation des commandes
// ─────────────────────────────────────────────────────────────

export function validateTerminalCommand(command: string): { ok: boolean; reason?: string } {
  if (typeof command !== "string" || command.trim().length === 0) {
    return { ok: false, reason: "commande vide" }
  }
  if (command.length > MAX_COMMAND_LENGTH) {
    return { ok: false, reason: `commande trop longue (>${MAX_COMMAND_LENGTH} caractères)` }
  }
  for (const { re, reason } of DESTRUCTIVE_PATTERNS) {
    if (re.test(command)) return { ok: false, reason: `commande refusée : ${reason}` }
  }
  return { ok: true }
}

/** Environnement épuré — AUCUN secret process.env ne fuit vers le shell. */
function sanitizedEnv(): Record<string, string> {
  return {
    PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
    HOME: tmpdir(),
    LANG: "C.UTF-8",
    TZ: "UTC",
    TERM: "dumb",
  }
}

// ─────────────────────────────────────────────────────────────
// Exécution (réservée au dispatch d'outils agent)
// ─────────────────────────────────────────────────────────────

/**
 * Exécute une commande dans la session terminal de l'agent.
 *
 * N'est JAMAIS appelée depuis une route HTTP utilisateur — uniquement via
 * runTool("terminal", …) depuis l'executor du moteur d'agents.
 */
export async function executeTerminalCommand(
  args: TerminalExecArgs,
  ctx: { userId: string; agentId?: string | null; taskId?: string | null }
): Promise<TerminalExecResult> {
  const command = String(args.command ?? "")
  const sessionId = args.sessionId
  const session = await ensureTerminalSession(ctx.userId, ctx.taskId ?? null, ctx.agentId ?? null)
  if (sessionId && sessionId !== session.id) {
    // Une session explicite autre que celle de la tâche : on la respecte
    // si elle appartient à l'utilisateur et est ACTIVE.
    const requested = await db.terminalSession.findFirst({
      where: { id: sessionId, userId: ctx.userId, status: "ACTIVE" },
    })
    if (requested) {
      session.id = requested.id
      session.workdir = requested.workdir
    }
  }

  const validation = validateTerminalCommand(command)
  if (!validation.ok) {
    const failed = await persistCommand(session.id, command, {
      exitCode: null,
      stdout: "",
      stderr: validation.reason ?? "commande refusée",
      truncated: false,
      durationMs: 0,
      timedOut: false,
      approved: false,
    })
    return {
      ok: false,
      exitCode: null,
      stdout: "",
      stderr: validation.reason ?? "commande refusée",
      truncated: false,
      durationMs: 0,
      sessionId: session.id,
      commandId: failed.id,
      timedOut: false,
    }
  }

  // Répertoire de travail relatif (restreint à la sandbox de session).
  let cwd = session.workdir
  if (args.workdir) {
    const rel = path.normalize(args.workdir).replace(/^(\.\.[/\\])+/, "")
    const resolved = path.resolve(session.workdir, rel)
    if (!resolved.startsWith(session.workdir)) {
      return invalidWorkdirResult(session.id, command)
    }
    await mkdir(resolved, { recursive: true }).catch(() => undefined)
    cwd = resolved
  }

  const timeoutMs = Math.min(
    Math.max(Number(args.timeoutMs) || DEFAULT_TIMEOUT_MS, 1000),
    MAX_TIMEOUT_MS
  )
  const started = Date.now()

  const result = await runShell(command, cwd, timeoutMs)
  const durationMs = Date.now() - started

  const persisted = await persistCommand(session.id, command, {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    truncated: result.truncated,
    durationMs,
    timedOut: result.timedOut,
    approved: true,
  })

  await appendAuditEntry({
    userId: ctx.userId,
    action: "terminal.execute",
    entityType: "terminal_session",
    entityId: session.id,
    detail: {
      command: command.slice(0, 200),
      exitCode: result.exitCode,
      durationMs,
      timedOut: result.timedOut,
      taskId: ctx.taskId ?? null,
      agentId: ctx.agentId ?? null,
    },
  }).catch(() => undefined)

  logger.info("terminal: commande exécutée", {
    sessionId: session.id,
    taskId: ctx.taskId,
    agentId: ctx.agentId,
    exitCode: result.exitCode,
    durationMs,
    timedOut: result.timedOut,
  })

  return {
    ok: result.exitCode === 0 && !result.timedOut,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    truncated: result.truncated,
    durationMs,
    sessionId: session.id,
    commandId: persisted.id,
    timedOut: result.timedOut,
  }
}

function invalidWorkdirResult(sessionId: string, command: string): TerminalExecResult {
  const msg = "répertoire de travail invalide (hors sandbox de session)"
  void persistCommand(sessionId, command, {
    exitCode: null,
    stdout: "",
    stderr: msg,
    truncated: false,
    durationMs: 0,
    timedOut: false,
    approved: false,
  })
  return {
    ok: false,
    exitCode: null,
    stdout: "",
    stderr: msg,
    truncated: false,
    durationMs: 0,
    sessionId,
    commandId: "",
    timedOut: false,
  }
}

interface ShellResult {
  exitCode: number | null
  stdout: string
  stderr: string
  truncated: boolean
  timedOut: boolean
}

/** Exécution shell avec timeout, plafond de sortie et kill du groupe. */
function runShell(command: string, cwd: string, timeoutMs: number): Promise<ShellResult> {
  return new Promise<ShellResult>((resolve) => {
    const child: import("node:child_process").ChildProcess = spawn(SHELL, ["-c", command], {
      cwd,
      env: sanitizedEnv() as unknown as NodeJS.ProcessEnv,
      stdio: ["ignore", "pipe", "pipe"],
      // Groupe de processus dédié → kill propre de toute la descendance.
      detached: process.platform !== "win32",
    } as never)

    let stdout = ""
    let stderr = ""
    let truncated = false
    let settled = false

    const cap = (chunk: Buffer, current: string): string => {
      if (Buffer.byteLength(current, "utf8") + chunk.length > MAX_OUTPUT_BYTES) {
        truncated = true
        return current + chunk.subarray(0, MAX_OUTPUT_BYTES - Buffer.byteLength(current, "utf8")).toString("utf8")
      }
      return current + chunk.toString("utf8")
    }

    child.stdout?.on("data", (c: Buffer) => { stdout = cap(c, stdout) })
    child.stderr?.on("data", (c: Buffer) => { stderr = cap(c, stderr) })

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try {
        if (child.pid && process.platform !== "win32") {
          process.kill(-child.pid, "SIGKILL")
        } else {
          child.kill("SIGKILL")
        }
      } catch {
        child.kill("SIGKILL")
      }
      resolve({ exitCode: null, stdout, stderr, truncated, timedOut: true })
    }, timeoutMs)

    child.on("error", (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({
        exitCode: null,
        stdout,
        stderr: `${stderr}\n${err.message}`.trim(),
        truncated,
        timedOut: false,
      })
    })

    child.on("close", (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ exitCode: code, stdout, stderr, truncated, timedOut: false })
    })
  })
}

async function persistCommand(
  sessionId: string,
  command: string,
  data: {
    exitCode: number | null
    stdout: string
    stderr: string
    truncated: boolean
    durationMs: number
    timedOut: boolean
    approved: boolean
  }
): Promise<{ id: string }> {
  const row = await db.terminalCommand.create({
    data: {
      sessionId,
      command,
      exitCode: data.exitCode,
      stdout: data.stdout.slice(0, 64_000),
      stderr: data.stderr.slice(0, 16_000),
      truncated: data.truncated,
      durationMs: data.durationMs,
      timedOut: data.timedOut,
      approved: data.approved,
    },
  })
  return { id: row.id }
}

// ─────────────────────────────────────────────────────────────
// Statistiques (santé / observabilité)
// ─────────────────────────────────────────────────────────────

export async function terminalStats(): Promise<{
  sessions: number
  commands: number
  activeSessions: number
  avgDurationMs: number
}> {
  const [sessions, activeSessions, commands, agg] = await Promise.all([
    db.terminalSession.count(),
    db.terminalSession.count({ where: { status: "ACTIVE" } }),
    db.terminalCommand.count(),
    db.terminalCommand.aggregate({ _avg: { durationMs: true } }),
  ])
  return {
    sessions,
    commands,
    activeSessions,
    avgDurationMs: agg._avg.durationMs ?? 0,
  }
}

/** Purge des sandbox de sessions clôturées de plus de `maxAgeHours`. */
export async function cleanupTerminalSandboxes(maxAgeHours = 72): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeHours * 3600_000)
  const stale = await db.terminalSession.findMany({
    where: { status: "CLOSED", createdAt: { lt: cutoff } },
    select: { id: true, workdir: true },
    take: 100,
  })
  let removed = 0
  for (const s of stale) {
    await rm(s.workdir, { recursive: true, force: true }).catch(() => undefined)
    removed++
  }
  return removed
}
