/* Initialisation SDK OpenTelemetry (Node). OTEL_ENABLED !== 1 -> no-op.
 * Export OTLP HTTP : Jaeger / Grafana Tempo / Collector. */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";

export function initTelemetry() {
  if (process.env.OTEL_ENABLED !== "1") return null;

  const exporter = new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318/v1/traces",
  });

  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "genovia-api",
    traceExporter: exporter,
    spanProcessor: new BatchSpanProcessor(exporter, { maxQueueSize: 2048, maxExportBatchSize: 512 }),
    instrumentations: [],
  });

  sdk.start();
  return sdk;
}
