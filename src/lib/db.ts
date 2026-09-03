import { PrismaClient } from '@prisma/client'
import { startSpan as otelStart, endSpan as otelEnd, otelEnabled } from '@/lib/observability/otel'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createClient(): PrismaClient {
  const base = new PrismaClient({
    log: ['query'],
  })
  // v3.6 — OpenTelemetry : instrumentation DB opt-in (OTEL_INSTRUMENT_DB=true).
  // Chaque opération Prisma devient un span otel.db.query — traçabilité des
  // latences de requêtes dans Jaeger/Tempo. Hors activation : client brut.
  if (otelEnabled() && (process.env.OTEL_INSTRUMENT_DB ?? 'false') === 'true') {
    return base.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            const span = otelStart('db.query', {
              'db.system': 'sqlite',
              'db.operation': operation,
              'db.model': model ?? 'unknown',
            })
            const started = Date.now()
            try {
              const result = await query(args)
              otelEnd(span, 'OK', { 'db.duration_ms': Date.now() - started })
              return result
            } catch (err) {
              otelEnd(span, 'ERROR', {}, err instanceof Error ? err.message : String(err))
              throw err
            }
          },
        },
      },
    }) as unknown as PrismaClient
  }
  return base
}

export const db = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
