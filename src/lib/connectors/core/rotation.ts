import crypto from "node:crypto"
import { db } from "@/lib/db"
import { logger } from "@/lib/observability/logger"
import { decryptJson, encryptJson, keyringStatus, needsRotation, type KeyringEntry, getKeyring } from "./crypto"

/**
 * Rotation des clés de chiffrement des connecteurs (v3.6).
 *
 * Protocole ZERO DOWNTIME :
 *  1. PRÉPARER — génère une nouvelle clé (keyId + hex 64) et produit la
 *     ligne d'environnement CONNECTORS_ENCRYPTION_KEYS="nouvelle;ancienne"
 *     à poser sur l'hébergeur (Vercel → Settings → Environment Variables).
 *     Dès la pose : les NOUVELLES écritures utilisent la nouvelle clé,
 *     les anciens secrets restent lisibles (ancienne clé dans le ring).
 *  2. RE-CHIFFRER — migrer l'existant vers la clé active (batch contrôlé,
 *     dry-run possible). La rotation paresseuse (connections.ts) complète
 *     les lignes non touchées à chaque lecture.
 *  3. RETIRER l'ancienne clé de l'environnement (une fois 0 payload
 *     restant — vérifiable via GET / status).
 *
 * Aucune étape n'interrompt le service : les secrets restent déchiffrables
 * pendant toute la transition (keyring multi-clés).
 */

/** Génère une nouvelle clé AES-256 (hex 64) + son identifiant daté. */ 
export function generateRotationKey(): { keyId: string; keyHex: string; createdAt: string } {
  const keyHex = crypto.randomBytes(32).toString("hex")
  const keyId = `k${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomBytes(3).toString("hex")}`
  return { keyId, keyHex, createdAt: new Date().toISOString() }
}

/**
 * Construit la spécification de keyring pour la phase de transition :
 * la nouvelle clé EN TÊTE (active), l'ancienne derrière (lecture seule).
 */
export function buildTransitionKeyringSpec(params: {
  newKeyId: string
  newKeyHex: string
  current: KeyringEntry[]
}): string {
  const parts = [`${params.newKeyId}:${params.newKeyHex}`]
  for (const entry of params.current) {
    if (entry.id === params.newKeyId) continue
    parts.push(`${entry.id}:${entry.key.toString("hex")}`)
  }
  return parts.join(";")
}

export interface EncryptedVersionCount {
  version: string // "v1" | "v2:<keyId>"
  count: number
}

export interface RotationStatus {
  keyring: ReturnType<typeof keyringStatus>
  totalAccounts: number
  byVersion: EncryptedVersionCount[]
  pendingRotation: number
  upToDate: number
}

/** Inventaire des versions de chiffrement des secrets en base. */
export async function rotationStatus(): Promise<RotationStatus> {
  const rows = await db.connectedAccount.findMany({
    select: { id: true, encryptedData: true },
    take: 100_000,
  })
  const byVersion = new Map<string, number>()
  let pending = 0
  let upToDate = 0
  for (const row of rows) {
    const parts = row.encryptedData.split(":")
    const version = parts.length === 5 && parts[0] === "v2" ? `v2:${parts[1]}` : "v1"
    byVersion.set(version, (byVersion.get(version) ?? 0) + 1)
    if (needsRotation(row.encryptedData)) pending++
    else upToDate++
  }
  return {
    keyring: keyringStatus(),
    totalAccounts: rows.length,
    byVersion: [...byVersion.entries()].map(([version, count]) => ({ version, count })).sort((a, b) => b.count - a.count),
    pendingRotation: pending,
    upToDate,
  }
}

export interface ReencryptResult {
  processed: number
  reencrypted: number
  failed: number
  errors: string[]
  dryRun: boolean
}

/**
 * Re-chiffre TOUS les secrets vers la clé ACTIVE du keyring courant.
 * Ne touche pas les payloads déjà à jour. dryRun = inventaire seul.
 * Appelée par /api/admin/crypto (POST action=reencrypt) et le CLI.
 */
export async function reencryptAllSecrets(options: { dryRun?: boolean; limit?: number } = {}): Promise<ReencryptResult> {
  const dryRun = options.dryRun ?? false
  const active = getKeyring()[0]
  const rows = await db.connectedAccount.findMany({
    select: { id: true, encryptedData: true },
    take: options.limit ?? 100_000,
  })

  const result: ReencryptResult = { processed: 0, reencrypted: 0, failed: 0, errors: [], dryRun }
  for (const row of rows) {
    result.processed++
    if (!needsRotation(row.encryptedData)) continue
    try {
      const data = decryptJson<unknown>(row.encryptedData)
      if (dryRun) {
        result.reencrypted++
        continue
      }
      await db.connectedAccount.update({
        where: { id: row.id },
        data: { encryptedData: encryptJson(data, { key: active }) },
      })
      result.reencrypted++
    } catch (err) {
      result.failed++
      const message = err instanceof Error ? err.message : String(err)
      if (result.errors.length < 20) result.errors.push(`${row.id}: ${message}`)
      logger.warn("rotation: re-chiffrement impossible pour une ligne", {
        connectionId: row.id,
        error: message,
      })
    }
  }
  logger.info("rotation: re-chiffrement terminé", {
    dryRun,
    processed: result.processed,
    reencrypted: result.reencrypted,
    failed: result.failed,
    activeKeyId: active.id,
  })
  return result
}
