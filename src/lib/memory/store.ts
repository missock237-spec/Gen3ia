import { db } from "@/lib/db"

/**
 * Memory — cinq couches de mémoire :
 *  - SHORT_TERM : contexte immédiat (TTL court)
 *  - LONG_TERM  : leçons durables tirées des tâches
 *  - TASK       : contexte propre à une tâche (reprise après interruption)
 *  - USER       : préférences et profil de l'utilisateur
 *  - AGENT      : connaissances propres à un agent
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
      metadata: JSON.stringify({ taskId: input.taskId ?? null }),
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

/** Rappel : préférences utilisateur + leçons les plus pertinentes, avec purge des expirées. */
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
