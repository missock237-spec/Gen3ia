/**
 * Request Tracer - Distributed Request Tracking
 * 
 * Tracks requests across multiple services with correlation IDs and timing
 */

import crypto from 'crypto';
import { createLogger } from '@/lib/logger';

const log = createLogger('request-tracer');

export interface TraceSpan {
  id: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'pending' | 'completed' | 'failed';
  tags: Record<string, any>;
  error?: {
    message: string;
    stack?: string;
  };
}

export interface RequestTrace {
  traceId: string;
  userId?: string;
  requestId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  method: string;
  endpoint: string;
  statusCode?: number;
  spans: TraceSpan[];
  error?: {
    message: string;
    code: string;
  };
}

class RequestTracer {
  private traces: Map<string, RequestTrace> = new Map();
  private activeSpans: Map<string, TraceSpan> = new Map();
  private maxTraces = 10000;

  constructor() {
    this.startCleanupInterval();
    log.info('request_tracer_initialized');
  }

  /**
   * Create a new trace for a request
   */
  createTrace(
    method: string,
    endpoint: string,
    userId?: string
  ): string {
    const traceId = crypto.randomUUID();
    const requestId = `req_${crypto.randomBytes(8).toString('hex')}`;

    const trace: RequestTrace = {
      traceId,
      requestId,
      userId,
      method,
      endpoint,
      startTime: Date.now(),
      spans: [],
    };

    this.traces.set(traceId, trace);

    log.debug('trace_created', {
      traceId: traceId.slice(0, 8),
      requestId: requestId.slice(0, 8),
      endpoint,
    });

    return traceId;
  }

  /**
   * Start a span within a trace
   */
  startSpan(traceId: string, name: string, parentSpanId?: string): string {
    const spanId = crypto.randomUUID();
    const trace = this.traces.get(traceId);

    if (!trace) {
      log.warn('span_started_for_unknown_trace', { traceId });
      return spanId;
    }

    const span: TraceSpan = {
      id: spanId,
      traceId,
      parentSpanId,
      name,
      startTime: Date.now(),
      status: 'pending',
      tags: {},
    };

    this.activeSpans.set(spanId, span);
    trace.spans.push(span);

    log.debug('span_started', {
      spanId: spanId.slice(0, 8),
      traceId: traceId.slice(0, 8),
      name,
    });

    return spanId;
  }

  /**
   * End a span and record duration
   */
  endSpan(spanId: string, status: 'completed' | 'failed' = 'completed'): void {
    const span = this.activeSpans.get(spanId);

    if (!span) {
      log.warn('end_span_called_for_unknown_span', { spanId });
      return;
    }

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = status;

    this.activeSpans.delete(spanId);

    log.debug('span_ended', {
      spanId: spanId.slice(0, 8),
      duration: span.duration,
      status,
    });
  }

  /**
   * Add tags to a span
   */
  addSpanTag(spanId: string, key: string, value: any): void {
    const span = this.activeSpans.get(spanId);

    if (span) {
      span.tags[key] = value;
    }
  }

  /**
   * Record error on span
   */
  recordSpanError(spanId: string, error: Error): void {
    const span = this.activeSpans.get(spanId);

    if (span) {
      span.error = {
        message: error.message,
        stack: error.stack,
      };
      span.status = 'failed';
    }
  }

  /**
   * End a trace
   */
  endTrace(traceId: string, statusCode?: number, error?: any): RequestTrace | null {
    const trace = this.traces.get(traceId);

    if (!trace) {
      return null;
    }

    trace.endTime = Date.now();
    trace.duration = trace.endTime - trace.startTime;
    trace.statusCode = statusCode;

    if (error) {
      trace.error = {
        message: error.message,
        code: error.code || 'UNKNOWN',
      };
    }

    // Close any remaining spans
    trace.spans.forEach((span) => {
      if (span.status === 'pending') {
        const endTime = trace.endTime ?? Date.now();
        span.endTime = endTime;
        span.duration = endTime - span.startTime;
        span.status = 'completed';
      }
    });

    log.info('trace_completed', {
      traceId: traceId.slice(0, 8),
      duration: trace.duration,
      spanCount: trace.spans.length,
      statusCode,
    });

    return trace;
  }

  /**
   * Get trace details
   */
  getTrace(traceId: string): RequestTrace | null {
    return this.traces.get(traceId) || null;
  }

  /**
   * Get traces for a user
   */
  getTracesForUser(userId: string, limit: number = 100): RequestTrace[] {
    const traces: RequestTrace[] = [];

    this.traces.forEach((trace) => {
      if (trace.userId === userId) {
        traces.push(trace);
      }
    });

    return traces.slice(-limit);
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): {
    avgLatency: number;
    maxLatency: number;
    minLatency: number;
    p95Latency: number;
    p99Latency: number;
    errorRate: number;
  } {
    const completedTraces = Array.from(this.traces.values()).filter((t) => t.duration);
    const durations = completedTraces.map((t) => t.duration!).sort((a, b) => a - b);
    const errors = completedTraces.filter((t) => t.error).length;

    if (durations.length === 0) {
      return {
        avgLatency: 0,
        maxLatency: 0,
        minLatency: 0,
        p95Latency: 0,
        p99Latency: 0,
        errorRate: 0,
      };
    }

    return {
      avgLatency: durations.reduce((a, b) => a + b, 0) / durations.length,
      maxLatency: Math.max(...durations),
      minLatency: Math.min(...durations),
      p95Latency: durations[Math.floor(durations.length * 0.95)],
      p99Latency: durations[Math.floor(durations.length * 0.99)],
      errorRate: (errors / completedTraces.length) * 100,
    };
  }

  /**
   * Clear old traces periodically
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      const fiveMinutesAgo = now - 5 * 60 * 1000;

      let cleaned = 0;
      this.traces.forEach((trace, traceId) => {
        if (trace.endTime && trace.endTime < fiveMinutesAgo) {
          this.traces.delete(traceId);
          cleaned++;
        }
      });

      if (cleaned > 0) {
        log.debug('traces_cleaned', { count: cleaned });
      }
    }, 60 * 1000); // Every minute
  }

  /**
   * Get trace statistics
   */
  getStats(): {
    activeTraces: number;
    totalTraces: number;
    activeSpans: number;
  } {
    return {
      activeTraces: Array.from(this.traces.values()).filter((t) => !t.endTime).length,
      totalTraces: this.traces.size,
      activeSpans: this.activeSpans.size,
    };
  }
}

export const requestTracer = new RequestTracer();
