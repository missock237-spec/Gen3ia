// ============================================================
// CORRELATION ID — Trace bout en bout des requêtes
// ============================================================
// Attache un ID de corrélation à chaque requête pour suivre
// le flux complet à travers logs, services et providers externes
// ============================================================

import { randomUUID } from "crypto";
import { logger } from "./logger";

// Stockage local pour le contexte async
const correlationContext = new Map<string, string>();
const requestStore = new Map<string, {
  correlationId: string;
  parentId: string | null;
  service: string;
  startTime: number;
  spans: Array<{
    id: string;
    name: string;
    startTime: number;
    endTime: number;
    status: "ok" | "error";
    metadata?: Record<string, unknown>;
  }>;
}>();

class CorrelationManager {
  // ============================================================
  // Créer ou récupérer un correlation ID
  // ============================================================
  getCurrentId(): string | null {
    // Vérifier dans le contexte local d'abord
    for (const [key, value] of correlationContext) {
      if (key.startsWith("correlation_")) return value;
    }
    return null;
  }

  // ============================================================
  // Initialiser un nouveau contexte de corrélation
  // ============================================================
  start(params: {
    correlationId?: string;
    parentId?: string;
    service: string;
    metadata?: Record<string, unknown>;
  }): string {
    const correlationId = params.correlationId ?? this.generateId();
    const parentId = params.parentId ?? null;

    correlationContext.set(`correlation_${correlationId}`, correlationId);

    requestStore.set(correlationId, {
      correlationId,
      parentId,
      service: params.service,
      startTime: Date.now(),
      spans: [],
    });

    logger.info("correlation_started", {
      correlationId,
      parentId,
      service: params.service,
      ...(params.metadata ?? {}),
    });

    return correlationId;
  }

  // ============================================================
  // Ajouter un span (opération unitaire)
  // ============================================================
  startSpan(name: string, metadata?: Record<string, unknown>): string {
    const correlationId = this.getCurrentId();
    if (!correlationId) {
      return this.start({ service: name });
    }

    const store = requestStore.get(correlationId);
    if (!store) return correlationId;

    const spanId = this.generateId();
    store.spans.push({
      id: spanId,
      name,
      startTime: Date.now(),
      endTime: 0,
      status: "ok",
      metadata,
    });

    logger.debug("correlation_span_started", {
      correlationId,
      spanId,
      name,
      ...(metadata ?? {}),
    });

    return spanId;
  }

  // ============================================================
  // Terminer un span
  // ============================================================
  endSpan(spanId: string, status: "ok" | "error" = "ok", metadata?: Record<string, unknown>): void {
    const correlationId = this.getCurrentId();
    if (!correlationId) return;

    const store = requestStore.get(correlationId);
    if (!store) return;

    const span = store.spans.find((s) => s.id === spanId);
    if (!span) return;

    span.endTime = Date.now();
    span.status = status;
    if (metadata) span.metadata = { ...span.metadata, ...metadata };
  }

  // ============================================================
  // Marquer une erreur sur la corrélation
  // ============================================================
  markError(error: Error | string, metadata?: Record<string, unknown>): void {
    const correlationId = this.getCurrentId();
    if (!correlationId) return;

    const errorMsg = error instanceof Error ? error.message : error;

    logger.error("correlation_error", {
      correlationId,
      error: errorMsg,
      ...(metadata ?? {}),
    });
  }

  // ============================================================
  // Terminer la corrélation et rapporter
  // ============================================================
  end(): {
    correlationId: string;
    durationMs: number;
    spanCount: number;
    spans: Array<{ name: string; durationMs: number; status: string }>;
  } | null {
    const correlationId = this.getCurrentId();
    if (!correlationId) return null;

    const store = requestStore.get(correlationId);
    if (!store) return null;

    const durationMs = Date.now() - store.startTime;

    const report = {
      correlationId,
      durationMs,
      spanCount: store.spans.length,
      spans: store.spans.map((s) => ({
        name: s.name,
        durationMs: s.endTime > 0 ? s.endTime - s.startTime : Date.now() - s.startTime,
        status: s.status,
      })),
    };

    logger.info("correlation_ended", {
      correlationId,
      durationMs,
      spanCount: store.spans.length,
    });

    // Nettoyage
    correlationContext.delete(`correlation_${correlationId}`);
    requestStore.delete(correlationId);

    return report;
  }

  // ============================================================
  // Injecter l'ID dans les en-têtes pour appels externes
  // ============================================================
  injectHeaders(): Record<string, string> {
    const correlationId = this.getCurrentId();
    if (!correlationId) return {};

    return {
      "X-Correlation-ID": correlationId,
      "X-Request-ID": correlationId,
    };
  }

  // ============================================================
  // Extraire l'ID depuis des en-têtes entrants
  // ============================================================
  extractFromHeaders(headers: Record<string, string | null>): string | null {
    const correlationId = headers["x-correlation-id"]
      ?? headers["X-Correlation-ID"]
      ?? headers["x-request-id"]
      ?? headers["X-Request-ID"];

    if (correlationId) {
      correlationContext.set(`correlation_${correlationId}`, correlationId);
    }

    return correlationId;
  }

  // ============================================================
  // Utilitaires
  // ============================================================
  private generateId(): string {
    return randomUUID().replace(/-/g, "").slice(0, 16);
  }

  // ============================================================
  // Nettoyer tous les contextes
  // ============================================================
  cleanup(): void {
    correlationContext.clear();
    requestStore.clear();
  }
}

export const correlationManager = new CorrelationManager();

// ============================================================
// Middleware helper — wrapper pour Next.js
// ============================================================
export function withCorrelation<T>(
  service: string,
  fn: () => Promise<T>,
  parentId?: string
): Promise<T> {
  const correlationId = correlationManager.start({ service, parentId });
  const spanId = correlationManager.startSpan(service);

  return fn()
    .then((result) => {
      correlationManager.endSpan(spanId, "ok");
      correlationManager.end();
      return result;
    })
    .catch((error) => {
      correlationManager.endSpan(spanId, "error", { error: String(error) });
      correlationManager.markError(error);
      correlationManager.end();
      throw error;
    });
}