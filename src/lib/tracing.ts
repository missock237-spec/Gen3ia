import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
const isProd = process.env.NODE_ENV === 'production';
const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces';
export function initTracing() {
  if (typeof window !== 'undefined') return null;
  if (!isProd && !process.env.OTEL_ENABLED) return null;
  const sdk = new NodeSDK({
// @ts-ignore — type narrowing pending, see refactor ticket
    resource: new Resource({ [SemanticResourceAttributes.SERVICE_NAME]: 'genova-ai', [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0', [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development' }),
    traceExporter: new OTLPTraceExporter({ url: endpoint }),
    instrumentations: [getNodeAutoInstrumentations()],
  });
  try { sdk.start(); } catch (e) { console.error('OTel error:', e); }
  process.on('SIGTERM', () => sdk.shutdown());
  return sdk;
}
export default initTracing;
