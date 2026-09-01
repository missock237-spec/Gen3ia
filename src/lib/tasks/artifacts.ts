import zlib from "zlib"
import { db } from "@/lib/db"
import { logger } from "@/lib/observability/logger"
import type { EvidenceItem } from "@/lib/engines/types"

/**
 * Artefacts de tâches (amélioration « Optimiser le Checkpointing »).
 *
 * Les charges volumineuses (preuves, sorties d'étapes, résultats de phase)
 * sont stockées compressées (gzip + base64) dans la table `TaskArtifact` ;
 * la ligne Task ne conserve que des métadonnées légères + un extrait de
 * prévisualisation. Bénéfices :
 *  - ligne Task mince → lecture/écriture de checkpoint rapide ;
 *  - reprise après interruption : hydratation à la demande ;
 *  - pas de troncature des preuves (l'intégrité des preuves est un
 *    pilier du moteur de vérification).
 *
 * Seuil : les contenus < 500 caractères restent en ligne dans le JSON de
 * la tâche (le coût d'un aller-retour dépasse le bénéfice).
 */

export const INLINE_THRESHOLD = 500

export interface ArtifactRef {
  artifactId: string
  bytes: number
  preview: string
}

export interface HydratedEvidence extends EvidenceItem {
  artifactId?: string
  bytes?: number
}

function gzipJson(value: unknown): { payload: string; bytes: number } {
  const json = JSON.stringify(value)
  const compressed = zlib.gzipSync(Buffer.from(json, "utf8"), { level: 6 })
  return { payload: compressed.toString("base64"), bytes: Buffer.byteLength(json) }
}

function gunzipJson(payload: string): unknown {
  const buffer = zlib.gunzipSync(Buffer.from(payload, "base64"))
  return JSON.parse(buffer.toString("utf8"))
}

/** Stocke un artefact compressé et retourne sa référence légère. */
export async function storeArtifact(
  taskId: string,
  kind: string,
  value: unknown,
  options?: { phase?: string; stepIndex?: number }
): Promise<ArtifactRef> {
  const { payload, bytes } = gzipJson(value)
  const artifact = await db.taskArtifact.create({
    data: {
      taskId,
      kind,
      phase: options?.phase ?? null,
      stepIndex: options?.stepIndex ?? null,
      payload,
      bytes,
    },
  })
  const preview =
    typeof value === "string"
      ? value.slice(0, INLINE_THRESHOLD)
      : JSON.stringify(value).slice(0, INLINE_THRESHOLD)
  return { artifactId: artifact.id, bytes, preview }
}

/**
 * Externalise les preuves volumineuses : retourne des preuves légères
 * (prévisualisation + référence d'artefact) — l'hydratation complète se
 * fait à la demande via hydrateEvidence().
 */
export async function externalizeEvidence(
  taskId: string,
  evidence: EvidenceItem[],
  options?: { phase?: string }
): Promise<Array<EvidenceItem & ArtifactRef>> {
  const out: Array<EvidenceItem & ArtifactRef> = []
  for (const item of evidence) {
    if (item.content.length <= INLINE_THRESHOLD) {
      out.push({ ...item, artifactId: "", bytes: item.content.length, preview: item.content })
      continue
    }
    const ref = await storeArtifact(taskId, "EVIDENCE", item.content, { phase: options?.phase })
    out.push({
      type: item.type,
      description: item.description,
      content: ref.preview,
      artifactId: ref.artifactId,
      bytes: ref.bytes,
      preview: ref.preview,
    })
  }
  return out
}

/** Réhydrate les preuves externalisées (lecture complète). */
export async function hydrateEvidence(
  evidence: Array<EvidenceItem & Partial<ArtifactRef>>
): Promise<EvidenceItem[]> {
  const out: EvidenceItem[] = []
  for (const item of evidence) {
    if (item.artifactId) {
      try {
        const artifact = await db.taskArtifact.findUnique({ where: { id: item.artifactId } })
        if (artifact) {
          const content = gunzipJson(artifact.payload)
          out.push({
            type: item.type,
            description: item.description,
            content: typeof content === "string" ? content : JSON.stringify(content),
          })
          continue
        }
      } catch (err) {
        logger.warn("artifacts: hydratation impossible", {
          artifactId: item.artifactId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    out.push({ type: item.type, description: item.description, content: item.content })
  }
  return out
}

/** Stocke la sortie complète d'une phase (checkpoint externe léger). */
export async function storePhaseOutput(
  taskId: string,
  phase: string,
  value: unknown
): Promise<ArtifactRef | null> {
  const json = JSON.stringify(value)
  if (json.length <= INLINE_THRESHOLD * 2) return null
  return storeArtifact(taskId, "PHASE_OUTPUT", value, { phase })
}

export async function loadArtifact(artifactId: string): Promise<unknown> {
  const artifact = await db.taskArtifact.findUnique({ where: { id: artifactId } })
  if (!artifact) return null
  return gunzipJson(artifact.payload)
}

export async function artifactStats(taskId: string) {
  const rows = await db.taskArtifact.findMany({
    where: { taskId },
    select: { kind: true, bytes: true },
  })
  return {
    count: rows.length,
    totalBytes: rows.reduce((acc, r) => acc + r.bytes, 0),
    byKind: Object.entries(
      rows.reduce<Record<string, number>>((acc, r) => {
        acc[r.kind] = (acc[r.kind] ?? 0) + r.bytes
        return acc
      }, {})
    ).map(([kind, bytes]) => ({ kind, bytes })),
  }
}
