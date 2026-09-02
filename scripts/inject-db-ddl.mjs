/**
 * Injecte le DDL généré (db/generated-*.sql) dans src/lib/db-init.ts entre
 * les marqueurs @generated-db-ddl. À exécuter après scripts/gen-db-ddl.mjs.
 *
 * Usage : node scripts/inject-db-ddl.mjs
 */
import { readFileSync, writeFileSync } from "node:fs"

const initPath = new URL("../src/lib/db-init.ts", import.meta.url).pathname
const sqlite = readFileSync(new URL("../db/generated-sqlite.sql", import.meta.url).pathname, "utf8")
const postgres = readFileSync(new URL("../db/generated-postgres.sql", import.meta.url).pathname, "utf8")

let src = readFileSync(initPath, "utf8")

function inject(src, dialect, sql) {
  const start = `// @generated-db-ddl:${dialect}:start`
  const end = `// @generated-db-ddl:${dialect}:end`
  const i = src.indexOf(start)
  const j = src.indexOf(end)
  if (i < 0 || j < 0) throw new Error(`Marqueurs introuvables pour ${dialect}`)
  return src.slice(0, i) + start + `\nconst ${dialect === "sqlite" ? "SQLITE_DDL" : "POSTGRES_DDL"} = \`\n${sql.trim()}\n\`\n` + src.slice(j)
}

src = inject(src, "sqlite", sqlite)
src = inject(src, "postgres", postgres)

writeFileSync(initPath, src)

const n = (s) => (s.match(/CREATE TABLE IF NOT EXISTS/g) || []).length
console.log(`[inject-db-ddl] SQLITE_DDL: ${n(sqlite)} tables, POSTGRES_DDL: ${n(postgres)} tables injectées dans db-init.ts`)
