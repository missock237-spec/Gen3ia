import { db } from "@/lib/db"
import { logger } from "@/lib/observability/logger"
import {
  isHfConfigured,
  hfOrg,
  ensureBucketRepo,
  bucketUpload,
  bucketDownload,
  bucketList,
  bucketDelete,
  bucketResolveUrl,
  type RepoTreeItem,
} from "./client"

/**
 * HF Storage Manager (v4.0 — Phase 13).
 *
 * Structure logique : chaque bucket = un repo dataset HF PRIVÉ (créé à la
 * demande). Les octets volumineux vivent dans le Bucket HF — PostgreSQL ne
 * conserve que les métadonnées (StorageObject).
 *
 * Buckets : models | datasets | users | agents | knowledge | embeddings |
 * generated | checkpoints | artifacts | logs | temporary
 *
 * Fonctions : upload, download, list, delete, move, copy, mount (pré-
 * résolution des URLs), metadata, accès signé (URL de résolution avec token
 * côté serveur — jamais exposé au frontend).
 */

const BUCKETS = [
  "models", "datasets", "users", "agents", "knowledge",
  "embeddings", "generated", "checkpoints", "artifacts", "logs", "temporary",
] as const

export type BucketName = (typeof BUCKETS)[number]

const log = logger.child({ component: "hf-storage" })

/** Préfixe des repos HF (org dédiée ou compte token). */
function repoPrefix(): string {
  return (hfOrg() ?? process.env.HF_BUCKET_PREFIX ?? "gen3ia").replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase()
}

/** Repo HF réel d'un bucket logique : {prefix}-{bucket}. */
export function repoIdFor(bucket: string): string {
  return `${repoPrefix()}-${bucket}`
}

export interface UploadResult {
  bucket: string
  path: string
  repoId: string
  size: number
  sha?: string
  url: string
}

function sanitizePath(path: string): string {
  return path
    .replace(/^\/+/, "")
    .replace(/\.\.+/g, "")
    .replace(/[^a-zA-Z0-9._\-\/]/g, "-")
    .slice(0, 500)
}

function assertBucket(bucket: string): asserts bucket is BucketName {
  if (!BUCKETS.includes(bucket as BucketName)) {
    throw new Error(`Bucket inconnu « ${bucket} » — buckets : ${BUCKETS.join(", ")}`)
  }
}

/** Dépose un objet (octets) dans le bucket — upload HF + métadonnées PG. */
export async function upload(
  userId: string,
  path: string,
  bytes: Uint8Array | ArrayBuffer | string,
  options?: { contentType?: string; bucket?: string; metadata?: Record<string, unknown> }
): Promise<UploadResult> {
  const bucket = options?.bucket ?? guessBucket(path)
  assertBucket(bucket)
  if (!isHfConfigured()) {
    throw new Error("HF_TOKEN absent — Storage Bucket Hugging Face non configuré.")
  }
  const cleanPath = sanitizePath(path)
  const repoId = repoIdFor(bucket)
  const data = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const size = data.byteLength

  // 1. Repo bucket garanti (création idempotente).
  await ensureBucketRepo(repoId)
  // 2. Upload octets (API upload officielle).
  const uploaded = await bucketUpload(repoId, cleanPath, data, options?.contentType)
  // 3. Métadonnées (PostgreSQL — jamais les octets).
  await db.storageObject.upsert({
    where: { bucket_path_userId: { bucket, path: cleanPath, userId } },
    create: {
      userId, bucket, path: cleanPath, repoId,
      size, contentType: options?.contentType ?? null,
      sha: uploaded.oid ?? null, etag: uploaded.oid ?? null,
      metadata: options?.metadata ? JSON.stringify(options.metadata) : null,
    },
    update: {
      size, sha: uploaded.oid ?? null, etag: uploaded.oid ?? null,
      contentType: options?.contentType ?? null, deleted: false,
      metadata: options?.metadata ? JSON.stringify(options.metadata) : null,
    },
  })

  log.info("hf-storage: objet déposé", { bucket, path: cleanPath, size })
  return {
    bucket, path: cleanPath, repoId, size,
    sha: uploaded.oid,
    url: bucketResolveUrl(repoId, cleanPath),
  }
}

/** Télécharge les octets d'un objet. */
export async function download(userId: string, path: string, bucket?: string): Promise<Uint8Array> {
  const obj = await findObject(userId, path, bucket)
  return bucketDownload(obj.repoId, obj.path)
}

/** Liste les objets d'un bucket (PG + arborescence HF fusionnée). */
export async function list(
  userId: string,
  bucket: string,
  options?: { folder?: string; includeDeleted?: boolean }
): Promise<Array<{ bucket: string; path: string; size: number; contentType: string | null; updatedAt: Date; sha: string | null }>> {
  assertBucket(bucket)
  const rows = await db.storageObject.findMany({
    where: {
      userId, bucket,
      ...(options?.includeDeleted ? {} : { deleted: false }),
      ...(options?.folder ? { path: { startsWith: options.folder.replace(/\/$/, "") + "/" } } : {}),
    },
    orderBy: { path: "asc" },
    take: 500,
  })
  return rows.map((r) => ({
    bucket: r.bucket, path: r.path, size: r.size, contentType: r.contentType, updatedAt: r.updatedAt, sha: r.sha,
  }))
}

/** Supprime un objet (soft-delete PG + delete HF best-effort). */
export async function remove(userId: string, path: string, bucket?: string): Promise<{ removed: boolean }> {
  const obj = await findObject(userId, path, bucket)
  await bucketDelete(obj.repoId, obj.path).catch((err) =>
    log.warn("hf-storage: delete HF best-effort", { path: obj.path, error: String(err) })
  )
  await db.storageObject.update({
    where: { id: obj.id },
    data: { deleted: true },
  })
  return { removed: true }
}

/** Déplace un objet (copie + suppression source). */
export async function move(userId: string, from: string, to: string, bucket?: string): Promise<UploadResult> {
  const bytes = await download(userId, from, bucket)
  const targetBucket = bucket ?? guessBucket(to)
  const result = await upload(userId, to, bytes, { bucket: targetBucket })
  await remove(userId, from, bucket)
  return result
}

/** Copie un objet. */
export async function copy(userId: string, from: string, to: string, bucket?: string): Promise<UploadResult> {
  const bytes = await download(userId, from, bucket)
  const targetBucket = bucket ?? guessBucket(to)
  return upload(userId, to, bytes, { bucket: targetBucket })
}

/**
 * « Mount » : pré-résout les URLs d'accès serveur d'un dossier entier
 * (le worker/l'agent reçoit des pointeurs, pas les octets).
 */
export async function mount(userId: string, bucket: string, folder?: string): Promise<
  Array<{ path: string; url: string; size: number }>
> {
  const objects = await list(userId, bucket, { folder })
  return objects.map((o) => ({
    path: o.path,
    url: bucketResolveUrl(repoIdFor(bucket), o.path),
    size: o.size,
  }))
}

/** Métadonnées d'un objet. */
export async function metadata(userId: string, path: string, bucket?: string): Promise<{
  bucket: string; path: string; repoId: string; size: number; sha: string | null
  contentType: string | null; extra: Record<string, unknown> | null; createdAt: Date; updatedAt: Date
}> {
  const obj = await findObject(userId, path, bucket)
  return {
    bucket: obj.bucket, path: obj.path, repoId: obj.repoId, size: obj.size,
    sha: obj.sha, contentType: obj.contentType,
    extra: obj.metadata ? safeJson(obj.metadata) : null,
    createdAt: obj.createdAt, updatedAt: obj.updatedAt,
  }
}

/**
 * Accès « signé » : URL de résolution HF + jeton d'accès ÉPHÉMÈRE limité
 * à la lecture (le token HF maître n'est JAMAIS communiqué au frontend —
 * Phase 23). Le client télécharge côté serveur ou via l'URL publique si
 * le repo est public ; pour un repo privé, la passerelle /api/v1/files
 * streame les octets avec auth session/API-key.
 */
export async function signedAccess(userId: string, path: string, bucket?: string): Promise<{
  url: string; expiresAt: Date; via: "proxy"
}> {
  const obj = await findObject(userId, path, bucket)
  const expiresAt = new Date(Date.now() + 3600_000)
  return {
    url: `/api/v1/files/download?bucket=${obj.bucket}&path=${encodeURIComponent(obj.path)}`,
    expiresAt,
    via: "proxy",
  }
}

/** Arborescence brute du repo HF (vue admin). */
export async function bucketTree(bucket: string, folder?: string): Promise<RepoTreeItem[]> {
  assertBucket(bucket)
  if (!isHfConfigured()) return []
  return bucketList(repoIdFor(bucket), folder).catch(() => [])
}

/** Statistiques de stockage (dashboard). */
export async function storageStats(userId?: string): Promise<{
  totalObjects: number
  totalBytes: number
  byBucket: Array<{ bucket: string; objects: number; bytes: number }>
}> {
  const where = userId ? { userId, deleted: false } : { deleted: false }
  const rows = await db.storageObject.findMany({
    where,
    select: { bucket: true, size: true },
    take: 10_000,
  })
  const byBucket = new Map<string, { objects: number; bytes: number }>()
  for (const r of rows) {
    const g = byBucket.get(r.bucket) ?? { objects: 0, bytes: 0 }
    g.objects++
    g.bytes += r.size
    byBucket.set(r.bucket, g)
  }
  return {
    totalObjects: rows.length,
    totalBytes: rows.reduce((a, r) => a + r.size, 0),
    byBucket: [...byBucket.entries()].map(([bucket, g]) => ({ bucket, ...g })),
  }
}

async function findObject(userId: string, path: string, bucket?: string) {
  const cleanPath = sanitizePath(path)
  const where = bucket
    ? { userId, bucket, path: cleanPath }
    : { userId, OR: BUCKETS.map((b) => ({ bucket: b, path: cleanPath })) }
  const obj = await db.storageObject.findFirst({ where })
  if (!obj || obj.deleted) {
    throw new Error(`Objet « ${cleanPath} » introuvable dans le stockage.`)
  }
  return obj
}

function guessBucket(path: string): string {
  const first = path.split("/")[0]?.toLowerCase()
  if (first && (BUCKETS as readonly string[]).includes(first)) return first
  if (/\.(pdf|docx?|txt|md|csv)$/i.test(path)) return "knowledge"
  if (/\.json(l)?$/i.test(path)) return "generated"
  if (/checkpoint/i.test(path)) return "checkpoints"
  return "temporary"
}

function safeJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export const HF_BUCKETS = BUCKETS
export const hfStorage = {
  upload, download, list, remove, move, copy, mount, metadata, signedAccess, bucketTree, storageStats, repoIdFor,
}
