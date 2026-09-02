/**
 * Génère le DDL d'initialisation runtime (db-init.ts) depuis le schéma Prisma
 * — source de vérité unique. Produit deux fichiers SQL (sqlite + postgres),
 * idempotents (IF NOT EXISTS), prêts à être incorporés dans src/lib/db-init.ts.
 *
 * Usage : node scripts/gen-db-ddl.mjs
 */
import { execSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"

function prismaDiff(schemaPath) {
  return execSync(
    `bunx prisma migrate diff --from-empty --to-schema-datamodel ${schemaPath} --script`,
    { encoding: "utf8", cwd: new URL("..", import.meta.url).pathname }
  )
}

/** Rend le script SQL idempotent et exécutable en boucle par lots. */
function idempotent(sql) {
  return sql
    .split("\n")
    .filter((l) => !l.startsWith("--")) // commentaires
    .join("\n")
    .replace(/PRAGMA[^;]+;/g, "") // directives sqlite non exécutables en boucle
    .replace(/CREATE TABLE "/g, 'CREATE TABLE IF NOT EXISTS "')
    .replace(/CREATE UNIQUE INDEX "/g, 'CREATE UNIQUE INDEX IF NOT EXISTS "')
    .replace(/CREATE INDEX "/g, 'CREATE INDEX IF NOT EXISTS "')
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

const sqlite = idempotent(prismaDiff("prisma/schema.sqlite.prisma"))
const postgres = idempotent(prismaDiff("prisma/schema.pg.prisma"))

writeFileSync(new URL("../db/generated-sqlite.sql", import.meta.url).pathname, sqlite + "\n")
writeFileSync(new URL("../db/generated-postgres.sql", import.meta.url).pathname, postgres + "\n")

const countSqlite = (sqlite.match(/CREATE TABLE IF NOT EXISTS/g) || []).length
const countPg = (postgres.match(/CREATE TABLE IF NOT EXISTS/g) || []).length
console.log(`[gen-db-ddl] sqlite: ${countSqlite} tables — postgres: ${countPg} tables`)
if (countSqlite !== countPg) {
  console.error("[gen-db-ddl] DIVERGENCE du nombre de tables entre dialectes !")
  process.exit(1)
}
