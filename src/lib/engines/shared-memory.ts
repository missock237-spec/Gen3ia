import { EventEmitter } from "events"
import { db } from "@/lib/db"
import type { SharedMemoryEntry } from "./types"

type MemoryNotifyCallback = (entry: SharedMemoryEntry) => void

/**
 * SharedMemoryManager — Gestionnaire de mémoire partagée inter-agents.
 * Implémente le pattern Read / Write / Notify :
 *  - Read : lecture persistée par session/namespace/clé
 *  - Write : mise à jour/création avec versionnage optimiste et persistance Prisma
 *  - Notify : notification pub/sub en temps réel pour les sous-agents abonnés
 */
export class SharedMemoryManager {
  private static instance: SharedMemoryManager
  private emitter: EventEmitter

  private constructor() {
    this.emitter = new EventEmitter()
    this.emitter.setMaxListeners(100)
  }

  public static getInstance(): SharedMemoryManager {
    if (!SharedMemoryManager.instance) {
      SharedMemoryManager.instance = new SharedMemoryManager()
    }
    return SharedMemoryManager.instance
  }

  /** Lit une valeur dans la mémoire partagée. */
  async read(sessionId: string, key: string, namespace = "default"): Promise<SharedMemoryEntry | null> {
    const record = await db.sharedMemory.findFirst({
      where: { sessionId, key, namespace },
      orderBy: { version: "desc" },
    })
    if (!record) return null
    return {
      id: record.id,
      sessionId: record.sessionId ?? undefined,
      key: record.key,
      value: JSON.parse(record.value),
      author: record.author,
      namespace: record.namespace,
      version: record.version,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    }
  }

  /** Écrit une valeur dans la mémoire partagée et notifie tous les sous-agents abonnés. */
  async write(
    sessionId: string,
    key: string,
    value: unknown,
    author: string,
    namespace = "default"
  ): Promise<SharedMemoryEntry> {
    const existing = await db.sharedMemory.findFirst({
      where: { sessionId, key, namespace },
      orderBy: { version: "desc" },
    })

    const nextVersion = existing ? existing.version + 1 : 1
    const stringified = JSON.stringify(value)

    const record = existing
      ? await db.sharedMemory.update({
          where: { id: existing.id },
          data: { value: stringified, author, version: nextVersion },
        })
      : await db.sharedMemory.create({
          data: { sessionId, key, value: stringified, author, namespace, version: nextVersion },
        })

    const entry: SharedMemoryEntry = {
      id: record.id,
      sessionId: record.sessionId ?? undefined,
      key: record.key,
      value,
      author: record.author,
      namespace: record.namespace,
      version: record.version,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    }

    this.emitter.emit(`memory:${sessionId}:${namespace}:${key}`, entry)
    this.emitter.emit(`memory:${sessionId}`, entry)

    return entry
  }

  /** Liste toutes les entrées de mémoire d'une session. */
  async list(sessionId: string, namespace?: string): Promise<SharedMemoryEntry[]> {
    const records = await db.sharedMemory.findMany({
      where: { sessionId, ...(namespace ? { namespace } : {}) },
      orderBy: { updatedAt: "desc" },
    })
    return records.map((r) => ({
      id: r.id,
      sessionId: r.sessionId ?? undefined,
      key: r.key,
      value: JSON.parse(r.value),
      author: r.author,
      namespace: r.namespace,
      version: r.version,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }))
  }

  /** S'abonne aux notifications de modification sur un canal de mémoire partagée. */
  subscribe(sessionId: string, callback: MemoryNotifyCallback, key?: string, namespace = "default"): () => void {
    const eventName = key ? `memory:${sessionId}:${namespace}:${key}` : `memory:${sessionId}`
    this.emitter.on(eventName, callback)
    return () => {
      this.emitter.off(eventName, callback)
    }
  }
}

export const sharedMemory = SharedMemoryManager.getInstance()
