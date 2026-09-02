/**
 * Synchronise les variantes de schéma Prisma (sqlite / postgresql) avec le
 * schéma principal fusionné. Le schéma principal reste la source de vérité ;
 * les variantes ne diffèrent QUE par le provider du datasource.
 *
 * Usage : node scripts/sync-schema-variants.mjs
 * (Appelé après toute modification de prisma/schema.prisma.)
 */
import { readFileSync, writeFileSync } from "node:fs"

const MAIN = "prisma/schema.prisma"
const SQLITE = "prisma/schema.sqlite.prisma"
const PG = "prisma/schema.pg.prisma"

const main = readFileSync(MAIN, "utf8")

// Le provider du datasource est la seule différence entre variantes.
if (!/provider\s*=\s*"sqlite"/.test(main) && !/provider\s*=\s*"postgresql"/.test(main)) {
  console.error("[sync-schema-variants] provider introuvable dans le schéma principal")
  process.exit(1)
}

const sqliteVariant = main.replace(/provider\s*=\s*"(sqlite|postgresql)"/, 'provider = "sqlite"')
const pgVariant = main.replace(/provider\s*=\s*"(sqlite|postgresql)"/, 'provider = "postgresql"')

writeFileSync(SQLITE, sqliteVariant)
writeFileSync(PG, pgVariant)

const count = (main.match(/^model /gm) || []).length
console.log(`[sync-schema-variants] ${count} modèles répliqués vers ${SQLITE} et ${PG}`)
