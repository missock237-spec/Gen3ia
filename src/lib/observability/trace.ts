/* Helpers de tracing OpenTelemetry. Backend agnostique (OTLP -> Jaeger/Tempo/Collector). */
import { trace, Span, SpanStatusCode } from "@opentelemetry/api";

export const tracer = () =>
  trace.getTracer("genovia", process.env.npm_package_version ?? "0.0.0");

export function startSpan(name: string, attrs?: Record<string, string | number | boolean>): Span {
  const span = tracer().startSpan(name);
  if (attrs) span.setAttributes(attrs);
  return span;
}

export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T> | T,
  attrs?: Record<string, string | number | boolean>,
): Promise<T> {
  const span = startSpan(name, attrs);
  try {
    const r = await fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return r;
  } catch (e) {
    span.recordException(e as Error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: (e as Error).message });
    throw e;
  } finally {
    span.end();
  }
}
