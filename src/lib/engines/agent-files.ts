/**
 * Espace de fichiers des agents (v4.1) — visualiseur de code.
 *
 * Les agents de code écrivent leurs fichiers via l'outil write_file ;
 * les utilisateurs (vibe codeurs / développeurs) les consultent, les
 * comparent entre versions, décident (APPROVE / REJECT) et peuvent les
 * MODIFIER — chaque édition humaine crée une nouvelle version, l'historique
 * est intégralement conservé (rollback possible).
 *
 * Persistance Prisma : AgentFile (méta + contenu courant) et
 * AgentFileVersion (historique immuable). Le contenu vit en base
 * (fichiers de code source : taille modérée, plafonnée) — les gros
 * binaires restent dans les Buckets HF (StorageObject).
 */

import { db } from "@/lib/db"
import { logger } from "@/lib/observability/logger"

// ─────────────────────────────────────────────────────────────
// Limites et validation
// ─────────────────────────────────────────────────────────────

const MAX_PATH_LENGTH = 200
const MAX_CONTENT_BYTES = 512 * 1024 // 512 Ko — un fichier de code raisonnable
const MAX_FILES_PER_USER = 2000

/** Chemins interdits (traversée, fichiers système). */
const FORBIDDEN_PATH_PATTERNS: RegExp[] = [
  /^\//, // absolu
  /^[a-zA-Z]:[\\/]/, // windows absolu
  /(^|\/)\.\.($|\/)/, // traversée parent
  /(^|\/)\.(git|env|ssh)(\/|$)/i, // dossiers/fichiers sensibles
]

export function normalizeAgentPath(rawPath: string): { ok: boolean; path?: string; reason?: string } {
  const trimmed = String(rawPath ?? "").trim()
  if (!trimmed) return { ok: false, reason: "chemin vide" }
  if (trimmed.length > MAX_PATH_LENGTH) return { ok: false, reason: `chemin trop long (>${MAX_PATH_LENGTH})` }
  for (const re of FORBIDDEN_PATH_PATTERNS) {
    if (re.test(trimmed)) return { ok: false, reason: "chemin interdit (absolu, traversée ou zone sensible)" }
  }
  const parts = trimmed.split(/[/\\]+/).filter((p) => p && p !== ".")
  if (parts.length === 0) return { ok: false, reason: "chemin invalide" }
  const clean = parts.join("/")
  return { ok: true, path: clean }
}

export function detectLanguage(filePath: string, explicit?: string): string {
  if (explicit && /^[a-z0-9]+$/i.test(explicit)) return explicit.toLowerCase()
  const ext = filePath.split(".").pop()?.toLowerCase() ?? ""
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", mts: "typescript", cts: "typescript",
    js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
    py: "python", rb: "ruby", go: "go", rs: "rust", java: "java",
    kt: "kotlin", swift: "swift", c: "c", h: "c", cpp: "cpp", hpp: "cpp",
    cs: "csharp", php: "php", sh: "bash", bash: "bash", zsh: "bash",
    sql: "sql", json: "json", yml: "yaml", yaml: "yaml", toml: "toml",
    xml: "xml", html: "html", htm: "html", css: "css", scss: "scss",
    md: "markdown", mdx: "markdown", txt: "text", csv: "csv", env: "text",
    prisma: "prisma", graphql: "graphql", gql: "graphql",
  }
  return map[ext] ?? "text"
}

// ─────────────────────────────────────────────────────────────
// Écriture (agents via write_file, humains via PATCH)
// ─────────────────────────────────────────────────────────────

export interface AgentFileSave {
  ok: boolean
  fileId: string
  path: string
  version: number
  bytes: number
  error?: string
}

/**
 * Enregistre (ou met à jour) un fichier dans l'espace utilisateur.
 * Utilisé par l'outil write_file des agents ET par l'édition humaine
 * (source: AGENT | HUMAN).
 */
export async function saveAgentFile(
  params: {
    path: string
    content: string
    language?: string
    description?: string
    taskId?: string | null
    agentId?: string | null
    source?: "AGENT" | "HUMAN"
  },
  userId: string
): Promise<AgentFileSave> {
  const norm = normalizeAgentPath(params.path)
  if (!norm.ok || !norm.path) return { ok: false, fileId: "", path: params.path, version: 0, bytes: 0, error: norm.reason }

  const content = String(params.content ?? "")
  const bytes = Buffer.byteLength(content, "utf8")
  if (bytes > MAX_CONTENT_BYTES) {
    return { ok: false, fileId: "", path: norm.path, version: 0, bytes, error: `fichier trop volumineux (> ${MAX_CONTENT_BYTES} octets) — utilisez le stockage Buckets pour les binaires` }
  }

  const count = await db.agentFile.count({ where: { userId } })
  if (count >= MAX_FILES_PER_USER) {
    return { ok: false, fileId: "", path: norm.path, version: 0, bytes, error: "quota de fichiers atteint (2000)" }
  }

  const language = detectLanguage(norm.path, params.language)
  const existing = await db.agentFile.findFirst({ where: { userId, path: norm.path } })

  if (existing) {
    const version = existing.version + 1
    const updated = await db.agentFile.update({
      where: { id: existing.id },
      data: {
        content,
        language,
        version,
        bytes,
        status: params.source === "HUMAN" ? "EDITED" : "PROPOSED",
        description: params.description ?? existing.description,
        taskId: params.taskId ?? existing.taskId,
        agentId: params.agentId ?? existing.agentId,
      },
    })
    await db.agentFileVersion.create({
      data: {
        fileId: updated.id,
        version,
        content,
        source: params.source ?? "AGENT",
        authorId: userId,
        description: params.description ?? null,
      },
    })
    logger.info("agent-files: version créée", { fileId: updated.id, path: norm.path, version, source: params.source ?? "AGENT" })
    return { ok: true, fileId: updated.id, path: norm.path, version, bytes }
  }

  const created = await db.agentFile.create({
    data: {
      userId,
      path: norm.path,
      content,
      language,
      bytes,
      status: "PROPOSED",
      description: params.description ?? null,
      taskId: params.taskId ?? null,
      agentId: params.agentId ?? null,
      version: 1,
    },
  })
  await db.agentFileVersion.create({
    data: {
      fileId: created.id,
      version: 1,
      content,
      source: params.source ?? "AGENT",
      authorId: userId,
      description: params.description ?? null,
    },
  })
  logger.info("agent-files: fichier créé", { fileId: created.id, path: norm.path })
  return { ok: true, fileId: created.id, path: norm.path, version: 1, bytes }
}

// ─────────────────────────────────────────────────────────────
// Lecture (visualiseur)
// ─────────────────────────────────────────────────────────────

export interface AgentFileView {
  id: string
  path: string
  language: string
  status: string
  version: number
  bytes: number
  description: string | null
  taskId: string | null
  agentId: string | null
  createdAt: string
  updatedAt: string
}

export interface AgentFileDetail extends AgentFileView {
  content: string
  versions: { version: number; source: string; createdAt: string; description: string | null }[]
}

function toView(r: {
  id: string
  path: string
  language: string
  status: string
  version: number
  bytes: number
  description: string | null
  taskId: string | null
  agentId: string | null
  createdAt: Date
  updatedAt: Date
}): AgentFileView {
  return {
    id: r.id,
    path: r.path,
    language: r.language,
    status: r.status,
    version: r.version,
    bytes: r.bytes,
    description: r.description,
    taskId: r.taskId,
    agentId: r.agentId,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }
}

export async function listAgentFiles(
  userId: string,
  opts: { taskId?: string; search?: string } = {}
): Promise<AgentFileView[]> {
  const where = {
    userId,
    ...(opts.taskId ? { taskId: opts.taskId } : {}),
    ...(opts.search
      ? { path: { contains: opts.search } as { contains: string } }
      : {}),
  }
  const rows = await db.agentFile.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 200,
  })
  return rows.map(toView)
}

export async function getAgentFile(userId: string, fileId: string): Promise<AgentFileDetail | null> {
  const row = await db.agentFile.findFirst({ where: { id: fileId, userId } })
  if (!row) return null
  const versions = await db.agentFileVersion.findMany({
    where: { fileId },
    orderBy: { version: "desc" },
    take: 50,
    select: { version: true, source: true, createdAt: true, description: true },
  })
  return {
    ...toView(row),
    content: row.content,
    versions: versions.map((v) => ({
      version: v.version,
      source: v.source,
      createdAt: v.createdAt.toISOString(),
      description: v.description,
    })),
  }
}

export async function getVersionContent(
  userId: string,
  fileId: string,
  version: number
): Promise<{ version: number; content: string; source: string } | null> {
  const file = await db.agentFile.findFirst({ where: { id: fileId, userId }, select: { id: true } })
  if (!file) return null
  const v = await db.agentFileVersion.findFirst({
    where: { fileId, version },
  })
  if (!v) return null
  return { version: v.version, content: v.content, source: v.source }
}

// ─────────────────────────────────────────────────────────────
// Décision humaine (voir / décider / modifier)
// ─────────────────────────────────────────────────────────────

export async function decideAgentFile(
  userId: string,
  fileId: string,
  decision: "APPROVE" | "REJECT"
): Promise<boolean> {
  const file = await db.agentFile.findFirst({ where: { id: fileId, userId } })
  if (!file) return false
  await db.agentFile.update({
    where: { id: file.id },
    data: { status: decision === "APPROVE" ? "APPROVED" : "REJECTED" },
  })
  return true
}

export async function deleteAgentFile(userId: string, fileId: string): Promise<boolean> {
  const file = await db.agentFile.findFirst({ where: { id: fileId, userId } })
  if (!file) return false
  await db.agentFileVersion.deleteMany({ where: { fileId: file.id } })
  await db.agentFile.delete({ where: { id: file.id } })
  return true
}

// ─────────────────────────────────────────────────────────────
// Statistiques
// ─────────────────────────────────────────────────────────────

export async function agentFilesStats(userId?: string): Promise<{
  files: number
  versions: number
  proposed: number
  approved: number
  edited: number
  rejected: number
  totalBytes: number
}> {
  const [files, versions, proposed, approved, edited, rejected, agg] = await Promise.all([
    db.agentFile.count({ where: userId ? { userId } : undefined }),
    db.agentFileVersion.count(),
    db.agentFile.count({ where: { ...(userId ? { userId } : {}), status: "PROPOSED" } }),
    db.agentFile.count({ where: { ...(userId ? { userId } : {}), status: "APPROVED" } }),
    db.agentFile.count({ where: { ...(userId ? { userId } : {}), status: "EDITED" } }),
    db.agentFile.count({ where: { ...(userId ? { userId } : {}), status: "REJECTED" } }),
    db.agentFile.aggregate({ where: userId ? { userId } : {}, _sum: { bytes: true } }),
  ])
  return {
    files,
    versions,
    proposed,
    approved,
    edited,
    rejected,
    totalBytes: agg._sum.bytes ?? 0,
  }
}
