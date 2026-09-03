import { randomBytes } from "node:crypto"
import { logger } from "./logger"

/**
 * Export OpenTelemetry OTLP/HTTP-JSON (v3.6 — observabilité).
 *
 * Implémentation autonome du protocole OTLP (sans les SDK lourds) :
 *  - spans au format OTLP JSON (resourceSpans → scopeSpans → spans) ;
 *  - export par lots NON BLOQUANT vers OTEL_EXPORTER_OTLP_ENDPOINT/v1/traces
 *    (Jaeger, Tempo, Grafana Alloy, SigNoz, OTel Collector…) ;
 *  - identifiants conformes : traceId 32 hex, spanId 16 hex, flags W3C ;
 *  - propagation du contexte : traceparent injecté dans les requêtes
 *    sortantes (fetch LLM/connecteurs) — traçabilité distribué de bout en
    bout ;
 *  - instrumentation sélective : OTEL_INSTRUMENT_LLM (défaut on),
 *    OTEL_INSTRUMENT_DB (défaut off — Prisma est verbeux), spans connecteurs
    toujours actifs quand OTel est activé.
 *
 * Zéro impact hors activation : sans OTEL_EXPORTER_OTLP_ENDPOINT, toutes les
 * fonctions sont des passages directs (overhead nul, fail-open intégral).
 */

const g = globalThis as unknown as {
  gen3iaOtel?: {
    queue: OtlpSpan[]
    flushing: boolean
    dropped: number
    exported: number
    failures: number
  }
}

interface OtlpSpan {
  traceId: string
  spanId: string
  parentId: string | null
  name: string
  kind: number
  startTimeUnixNano: string
  endTimeUnixNano: string
  attributes: Record<string, string | number | boolean>
  status: { code: number; message?: string }
}

function state() {
  if (!g.gen3iaOtel) g.gen3iaOtel = { queue: [], flushing: false, dropped: 0, exported: 0, failures: 0 }
  return g.gen3iaOtel
}

export function otelEnabled(): boolean {
  return Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim())
}

export function serviceName(): string {
  return process.env.OTEL_SERVICE_NAME ?? "gen3ia"
}

/** Horloge nanosecondes OTLP. */
function nowNano(): string {
  return String(BigInt(Date.now()) * 1_000_000n)
}

function newId(bytes: number): string {
  return randomBytes(bytes).toString("hex")
}

export interface SpanContext {
  traceId: string
  spanId: string
  parentId: string | null
  name: string
  startTime: string
  ended: boolean
}

/** Démarre un span (no-op hors activation). */
export function startSpan(name: string, attributes: Record<string, string | number | boolean> = {}, parent?: SpanContext | null): SpanContext | null {
  if (!otelEnabled()) return null
  const ctx: SpanContext = {
    traceId: parent?.traceId ?? newId(16),
    spanId: newId(8),
    parentId: parent?.spanId ?? null,
    name,
    startTime: nowNano(),
    ended: false,
  }
  void ctx
  // Le span est mis en file à la FIN (endSpan) — startSpan reste léger.
  pending.set(ctx.spanId, { ctx, attributes })
  return ctx
}

const pending = new Map<string, { ctx: SpanContext; attributes: Record<string, string | number | boolean> }>()

/** Termine un span et l'enfile pour export. */
export function endSpan(span: SpanContext | null, status: "OK" | "ERROR" = "OK", attributes: Record<string, string | number | boolean> = {}, message?: string): void {
  if (!span || !otelEnabled()) return
  const entry = pending.get(span.spanId)
  pending.delete(span.spanId)
  if (span.ended) return
  span.ended = true
  const s = state()
  s.queue.push({
    traceId: span.traceId,
    spanId: span.spanId,
    parentId: span.parentId,
    name: span.name,
    kind: 1, // INTERNAL
    startTimeUnixNano: span.startTime,
    endTimeUnixNano: nowNano(),
    attributes: { ...entry?.attributes, ...attributes },
    status: { code: status === "OK" ? 1 : 2, ...(message ? { message } : {}) },
  })
  if (s.queue.length >= 64) void flush()
}

/**
 * Enveloppe une opération async dans un span (mode déclaratif).
 * L'erreur est enregistrée puis relancée (jamais avalée).
 */
export async function withSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean>,
  fn: (span: SpanContext | null) => Promise<T>
): Promise<T> {
  const span = startSpan(name, attributes)
  try {
    const result = await fn(span)
    endSpan(span, "OK")
    return result
  } catch (err) {
    endSpan(span, "ERROR", { "error.type": err instanceof Error ? err.constructor.name : "Error" }, err instanceof Error ? err.message : String(err))
    throw err
  }
}

/** En-tête traceparent W3C pour la propagation vers les services externes. */
export function traceparentHeader(span: SpanContext | null): Record<string, string> {
  if (!span || !otelEnabled()) return {}
  return { traceparent: `00-${span.traceId}-${span.spanId}-01` }
}

/** Export par lots vers le collecteur (non bloquant, best-effort). */
export async function flush(): Promise<void> {
  const s = state()
  if (s.flushing || s.queue.length === 0 || !otelEnabled()) return
  s.flushing = true
  const batch = s.queue.splice(0, 128)
  try {
    const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT!.replace(/\/+$/, "")
    const body = JSON.stringify({
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: "service.name", value: { stringValue: serviceName() } },
              { key: "service.version", value: { stringValue: "3.6.0" } },
              { key: "telemetry.sdk.name", value: { stringValue: "gen3ia-otlp" } },
              { key: "telemetry.sdk.language", value: { stringValue: "node" } },
            ],
          },
          scopeSpans: [
            {
              scope: { name: "gen3ia.platform", version: "3.6.0" },
              spans: batch,
            },
          ],
        },
      ],
    })
    const res = await fetch(`${endpoint}/v1/traces`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      s.failures++
      logger.warn("otel: collecteur a répondu en erreur", { status: res.status, spans: batch.length })
    } else {
      s.exported += batch.length
    }
  } catch (err) {
    s.failures++
    // Fail-open intégral : l'observabilité ne peut jamais casser la prod.
    logger.debug("otel: export impossible (non bloquant)", {
      error: err instanceof Error ? err.message : String(err),
    })
  } finally {
    s.flushing = false
    if (s.queue.length > 0) void flush()
  }
}

/** Statistiques d'export (observabilité de l'observabilité). */
export function otelStats() {
  const s = state()
  return {
    enabled: otelEnabled(),
    endpoint: otelEnabled() ? process.env.OTEL_EXPORTER_OTLP_ENDPOINT : null,
    serviceName: serviceName(),
    queued: s.queue.length + pending.size,
    exported: s.exported,
    failures: s.failures,
    instrumentDb: (process.env.OTEL_INSTRUMENT_DB ?? "false") === "true",
  }
}

/** Vide l'état (tests). */
export function resetOtel(): void {
  g.gen3iaOtel = { queue: [], flushing: false, dropped: 0, exported: 0, failures: 0 }
  pending.clear()
}
