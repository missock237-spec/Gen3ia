import { db } from "@/lib/db"
import { embedTexts, cosineSimilarity } from "@/lib/rag/embeddings"

/**
 * Memory — cinq couches de mémoire :
 *  - SHORT_TERM : contexte immédiat (TTL court)
 *  - LONG_TERM  : leçons durables et patrons réutilisables (v3.1)
 *  - TASK       : contexte propre à une tâche (reprise après interruption)
 *  - USER       : préférences et profil de l'utilisateur
 *  - AGENT      : connaissances propres à un agent
 *
 * v3.1 : le rappel combine filtre lexical + importance, puis re-classe
 * les meilleurs candidats par similarité sémantique (embeddings) —
 * les leçons apparentées remontent même sans mot-clé commun.
 */

export type MemoryLayer =
  | "SHORT_TERM"
  | "LONG_TERM"
  | "TASK"
  | "USER"
  | "AGENT"

export interface MemoryWriteInput {
  userId: string
  layer: MemoryLayer
  content: string
  importance?: number
  agentId?: string | null
  taskId?: string | null
  ttlMinutes?: number // pour SHORT_TERM
  metadata?: Record<string, unknown> // v3.1 : typage des souvenirs (LESSON, PATTERN…)
}

export async function writeMemory(input: MemoryWriteInput) {
  const expiresAt =
    input.layer === "SHORT_TERM" && input.ttlMinutes
      ? new Date(Date.now() + input.ttlMinutes * 60_000)
      : null
  return db.memory.create({
    data: {
      userId: input.userId,
      agentId: input.agentId ?? null,
      layer: input.layer,
      content: input.content.slice(0, 2000),
      importance: Math.min(1, Math.max(0, input.importance ?? 0.5)),
      metadata: JSON.stringify({ taskId: input.taskId ?? null, ...(input.metadata ?? {}) }),
      expiresAt,
    },
  })
}

export interface RecalledMemory {
  id: string
  layer: MemoryLayer
  content: string
  importance: number
  createdAt: Date
}

/** Rappel : préfiltrage lexical + importance, re-classement sémantique, purge des expirées. */
export async function recallMemories(
  userId: string,
  opts?: { layers?: MemoryLayer[]; agentId?: string | null; limit?: number; query?: string }
): Promise<RecalledMemory[]> {
  const limit = opts?.limit ?? 6

  // Purge paresseuse des mémoires court terme expirées.
  await db.memory.deleteMany({
    where: { userId, layer: "SHORT_TERM", expiresAt: { lt: new Date() } },
  }).catch(() => undefined)

  const layerFilter = opts?.layers ?? ["USER", "LONG_TERM"]
  const memories = await db.memory.findMany({
    where: {
      userId,
      layer: { in: layerFilter },
      OR: opts?.agentId
        ? [{ agentId: null }, { agentId: opts.agentId }]
        : undefined,
    },
    orderBy: [{ importance: "desc" }, { createdAt: "desc" }],
    take: 50,
  })

  let filtered = memories
  if (opts?.query) {
    const tokens = opts.query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2)
    if (tokens.length > 0) {
      const scored = memories.map((m) => ({
        m,
        score:
          tokens.reduce(
            (acc, t) => acc + (m.content.toLowerCase().includes(t) ? 1 : 0), 0
          ) + m.importance,
      }))
      scored.sort((a, b) => b.score - a.score)
      filtered = scored.map((s) => s.m)
    }

    // v3.1 — re-classement sémantique des meilleurs candidats :
    // les leçons apparentées (paraphrases) remontent même sans mot-clé commun.
    try {
      const candidates = filtered.slice(0, 12)
      if (candidates.length > 1) {
        const [queryVec, ...contentVecs] = await embedTexts([
          opts.query.slice(0, 1500),
          ...candidates.map((m) => m.content.slice(0, 1500)),
        ])
        const semantic = candidates.map((m, i) => ({
          m,
          sim: cosineSimilarity(
            queryVec.vector, queryVec.norm,
            contentVecs[i].vector, contentVecs[i].norm
          ),
        }))
        // Score combiné : 0.6·sémantique + 0.25·importance + 0.15·présence lexicale.
        const lexicalScore = (content: string) => {
          if (tokens.length === 0) return 0
          const lower = content.toLowerCase()
          const hits = tokens.filter((t) => lower.includes(t)).length
          return hits / tokens.length
        }
        semantic.sort((a, b) => {
          const scoreA = 0.6 * a.sim + 0.25 * a.m.importance + 0.15 * lexicalScore(a.m.content)
          const scoreB = 0.6 * b.sim + 0.25 * b.m.importance + 0.15 * lexicalScore(b.m.content)
          return scoreB - scoreA
        })
        filtered = semantic.map((s) => s.m).concat(filtered.slice(12))
      }
    } catch {
      // Fournisseur d'embedding indisponible : le classement lexical reste.
    }
  }

  return filtered.slice(0, limit).map((m) => ({
    id: m.id,
    layer: m.layer as MemoryLayer,
    content: m.content,
    importance: m.importance,
    createdAt: m.createdAt,
  }))
}

export async function forgetMemory(userId: string, memoryId: string) {
  return db.memory.deleteMany({ where: { id: memoryId, userId } })
}
