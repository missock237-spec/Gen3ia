/**
 * Correlation ID & Distributed Tracing
 * 
 * Provides end-to-end tracing through:
 * - Request lifecycle (start → process → end)
 * - Database queries
 * - External API calls
 * - Log aggregation (injected into every log)
 * - OpenTelemetry compatibility
 * 
 * Uses AsyncLocalStorage to preserve context through async operations.
 */

import { randomUUID } from "crypto";
import { AsyncLocalStorage } from "async_hooks";
import { logger } from "./logger";

// AsyncLocalStorage for proper async context preservation
interface CorrelationContext {
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
}

const correlationStorage = new AsyncLocalStorage<CorrelationContext>();

class CorrelationManager {
  /**
   * Get current correlation ID from AsyncLocalStorage
   */
  getCurrentId(): string | null {
    const context = correlationStorage.getStore();
    return context?.correlationId ?? null;
  }

  /**
   * Start a new correlation context
   */
  start(params: {
    correlationId?: string;
    parentId?: string;
    service: string;
    metadata?: Record<string, unknown>;
  }): string {
    const correlationId = params.correlationId ?? this.generateId();
    const parentId = params.parentId ?? null;

    const context: CorrelationContext = {
      correlationId,
      parentId,
      service: params.service,
      startTime: Date.now(),
      spans: [],
    };

    correlationStorage.enterWith(context);

    logger.info("Correlation started", {
      correlationId,
      parentId,
      service: params.service,
      ...(params.metadata ?? {}),
    });

    return correlationId;
  }

  /**
   * Start a named span (sub-operation)
   */
  startSpan(name: string, metadata?: Record<string, unknown>): string {
    const context = correlationStorage.getStore();
    if (!context) {
      return this.start({ service: name });
    }

    const spanId = this.generateId();
    context.spans.push({
      id: spanId,
      name,
      startTime: Date.now(),
      endTime: 0,
      status: "ok",
      metadata,
    });

    logger.debug("Span started", {
      correlationId: context.correlationId,
      spanId,
      name,
      ...(metadata ?? {}),
    });

    return spanId;
  }

  /**
   * End a span and record metrics
   */
  endSpan(spanId: string, status: "ok" | "error" = "ok", metadata?: Record<string, unknown>): void {
    const context = correlationStorage.getStore();
    if (!context) return;

    const span = context.spans.find((s) => s.id === spanId);
    if (!span) return;

    span.endTime = Date.now();
    span.status = status;
    if (metadata) span.metadata = { ...span.metadata, ...metadata };

    logger.debug("Span ended", {
      correlationId: context.correlationId,
      spanId,
      name: span.name,
      duration: span.endTime - span.startTime,
      status,
    });
  }

  /**
   * Mark an error in the current correlation context
   */
  markError(error: Error | string, metadata?: Record<string, unknown>): void {
    const context = correlationStorage.getStore();
    if (!context) return;

    const errorMsg = error instanceof Error ? error.message : error;

    logger.error("Correlation error", {
      correlationId: context.correlationId,
      error: errorMsg,
      ...(metadata ?? {}),
    });
  }

  /**
   * End correlation and return trace report
   */
  end(): {
    correlationId: string;
    durationMs: number;
    spanCount: number;
    spans: Array<{ name: string; durationMs: number; status: string }>;
  } | null {
    const context = correlationStorage.getStore();
    if (!context) return null;

    const durationMs = Date.now() - context.startTime;

    const report = {
      correlationId: context.correlationId,
      durationMs,
      spanCount: context.spans.length,
      spans: context.spans.map((s) => ({
        name: s.name,
        durationMs: s.endTime > 0 ? s.endTime - s.startTime : Date.now() - s.startTime,
        status: s.status,
      })),
    };

    logger.info("Correlation ended", {
      correlationId: context.correlationId,
      durationMs,
      spanCount: context.spans.length,
      service: context.service,
    });

    return report;
  }

  /**
   * Get headers to inject correlation ID into external calls
   */
  injectHeaders(): Record<string, string> {
    const correlationId = this.getCurrentId();
    if (!correlationId) return {};

    return {
      "X-Correlation-ID": correlationId,
      "X-Request-ID": correlationId,
      "Traceparent": `00-${correlationId.padEnd(32, '0')}-0000000000000001-01`, // W3C Trace Context
    };
  }

  /**
   * Extract correlation ID from incoming headers
   */
  extractFromHeaders(headers: Record<string, string | null>): string | null {
    return headers["x-correlation-id"]
      ?? headers["X-Correlation-ID"]
      ?? headers["x-request-id"]
      ?? headers["X-Request-ID"];
  }

  /**
   * Generate random ID (16 chars)
   */
  private generateId(): string {
    return randomUUID().replace(/-/g, "").slice(0, 16);
  }
}

export const correlationManager = new CorrelationManager();

/**
 * Run an async function with correlation tracking
 * Useful for Next.js API routes, server actions, etc.
 */
export function withCorrelation<T>(
  service: string,
  fn: () => Promise<T>,
  parentId?: string,
): Promise<T> {
  return correlationStorage.run(
    {
      correlationId: randomUUID().slice(0, 16),
      parentId: parentId ?? null,
      service,
      startTime: Date.now(),
      spans: [],
    },
    async () => {
      const spanId = correlationManager.startSpan(service);

      try {
        const result = await fn();
        correlationManager.endSpan(spanId, "ok");
        correlationManager.end();
        return result;
      } catch (error) {
        correlationManager.endSpan(spanId, "error", { error: String(error) });
        correlationManager.markError(error instanceof Error ? error : String(error));
        correlationManager.end();
        throw error;
      }
    },
  );
}
