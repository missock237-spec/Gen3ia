import { PrismaClient } from '@prisma/client'
import { startSpan as otelStart, endSpan as otelEnd, otelEnabled } from '@/lib/observability/otel'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  __gen3iaDbUrl: string | undefined
  __gen3iaDbSwitchable: PrismaClient | undefined
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

// ─────────────────────────────────────────────────────────────
// v4.1 — Isolation des suites de tests Bun.
//
// `bun test` exécute tous les fichiers de tests dans un MÊME processus :
// chaque fichier surcharge DATABASE_URL AVANT d'importer @/lib/db, mais
// le singleton global historique conservait le client de la première
// base chargée — les fichiers suivants interrogeaient la mauvaise base
// (échecs dépendant de l'ordre alphabétique des fichiers).
//
// Correction : le client suit l'URL EFFECTIVE. En production l'URL
// ne change jamais en cours d'exécution (coût d'un accès : une
// comparaison de chaîne) ; en test, chaque fichier de tests reçoit
// un client branché sur SA base dédiée.
// ─────────────────────────────────────────────────────────────

function ensureClientForCurrentUrl(): PrismaClient {
  const url = process.env.DATABASE_URL
  if (globalForPrisma.prisma && globalForPrisma.__gen3iaDbUrl === url) {
    return globalForPrisma.prisma
  }
  const stale = globalForPrisma.prisma
  globalForPrisma.__gen3iaDbUrl = url
  globalForPrisma.prisma = createClient()
  if (stale && stale !== globalForPrisma.prisma) {
    void stale.$disconnect().catch(() => undefined)
  }
  return globalForPrisma.prisma
}

/** Client Prisma actif pour l'URL courante (bascule dynamique). */
export function prismaClient(): PrismaClient {
  return ensureClientForCurrentUrl()
}

/**
 * `db` — proxy de bascule vers le client de l'URL courante.
 * Comportement strictement identique à un PrismaClient en production.
 */
export const db: PrismaClient = (globalForPrisma.__gen3iaDbSwitchable ??= new Proxy(
  {} as PrismaClient,
  {
    get(_target, prop) {
      const client = ensureClientForCurrentUrl()
      const value = Reflect.get(client as unknown as Record<string | symbol, unknown>, prop, client)
      if (typeof value === 'function') {
        return (value as (...args: unknown[]) => unknown).bind(client)
      }
      return value
    },
    has(_target, prop) {
      const client = ensureClientForCurrentUrl()
      return prop in (client as object)
    },
  }
) as PrismaClient)
