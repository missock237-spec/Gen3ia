import { db } from "@/lib/db"
import { randomUUID } from "crypto"
import { logger } from "@/lib/observability/logger"
import type { TraceSpan } from "@/lib/engines/types"

/**
 * Tracing distribué (style OpenTelemetry) — Propagation de contexte
 * à travers les moteurs, outils et appels LLM avec spans parent-child.
 */

export class Tracer {
  private static instance: Tracer
  private currentSpan: ThreadLocal<TraceSpan | null>

  private constructor() {
    this.currentSpan = new ThreadLocal(null)
  }

  static getInstance(): Tracer {
    if (!Tracer.instance) Tracer.instance = new Tracer()
    return Tracer.instance
  }

  /**
   * Démarre une nouvelle trace (span racine).
   */
  async startTrace(name: string, taskId?: string, userId?: string): Promise<{ traceId: string; spanId: string; span: TraceSpan }> {
    const traceId = randomUUID()
    const spanId = randomUUID()
    const span: TraceSpan = {
      spanId,
      traceId,
      name,
      startTime: Date.now(),
      attributes: {},
      status: "UNSET",
      events: [],
    }
    this.currentSpan.set(span)

    // Persister la trace
    await db.trace.create({
      data: { traceId, taskId, userId, rootSpanId: spanId, status: "RUNNING" },
    })
    await db.traceSpan.create({
      data: {
        traceId,
        spanId,
        name,
        startTime: span.startTime,
        attributes: JSON.stringify({}),
        status: "UNSET",
        events: JSON.stringify([]),
      },
    })

    return { traceId, spanId, span }
  }

  /**
   * Démarre un span enfant.
   */
  startSpan(name: string, attributes?: Record<string, unknown>): TraceSpan {
    const parent = this.currentSpan.get()
    const spanId = randomUUID()
    const traceId = parent?.traceId ?? randomUUID()

    const span: TraceSpan = {
      spanId,
      parentSpanId: parent?.spanId,
      traceId,
      name,
      startTime: Date.now(),
      attributes: attributes ?? {},
      status: "UNSET",
      events: [],
    }
    return span
  }

  /**
   * Termine un span et le persiste.
   */
  async endSpan(span: TraceSpan, status: "OK" | "ERROR" = "OK"): Promise<void> {
    span.endTime = Date.now()
    span.durationMs = span.endTime - span.startTime
    span.status = status

    // Mettre à jour le parent si c'est un span enfant
    const parent = this.currentSpan.get()
    if (parent && span.parentSpanId === parent.spanId) {
      // OK
    }

    await db.traceSpan.updateMany({
      where: { spanId: span.spanId, traceId: span.traceId },
      data: {
        endTime: span.endTime,
        durationMs: span.durationMs,
        attributes: JSON.stringify(span.attributes),
        status,
        events: JSON.stringify(span.events),
      },
    }).catch(() => undefined)

    await db.trace.updateMany({
      where: { traceId: span.traceId },
      data: { spans: { increment: 1 } },
    }).catch(() => undefined)
  }

  /**
   * Ajoute un attribut au span courant.
   */
  setAttribute(key: string, value: unknown): void {
    const span = this.currentSpan.get()
    if (span) span.attributes[key] = value
  }

  /**
   * Ajoute un événement au span courant.
   */
  addEvent(name: string, attributes?: Record<string, unknown>): void {
    const span = this.currentSpan.get()
    if (span) {
      span.events.push({ name, timestamp: Date.now(), attributes })
    }
  }

  /**
   * Récupère une trace complète avec tous ses spans.
   */
  async getTrace(traceId: string) {
    const trace = await db.trace.findUnique({ where: { traceId } })
    if (!trace) return null
    const spans = await db.traceSpan.findMany({ where: { traceId }, orderBy: { startTime: "asc" } })
    return { ...trace, spans }
  }
}

/**
 * ThreadLocal simplifié (serverless — pas de vraie concurrence dans un seul appel).
 */
class ThreadLocal<T> {
  private value: T
  constructor(initial: T) { this.value = initial }
  get(): T { return this.value }
  set(v: T): void { this.value = v }
}

export const tracer = Tracer.getInstance()
