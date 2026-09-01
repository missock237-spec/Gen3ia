/**
 * Sélection du dialecte Prisma selon DATABASE_URL.
 * Exécuté avant `prisma generate` (postinstall) — les variables
 * d'environnement Vercel sont disponibles à la construction.
 *
 * - file:…            → schéma SQLite (par défaut, développement / démo)
 * - postgres://…      → schéma PostgreSQL (persistance serverless)
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs"

const SQLITE = "prisma/schema.sqlite.prisma"
const PG = "prisma/schema.pg.prisma"
const TARGET = "prisma/schema.prisma"

const url = (process.env.DATABASE_URL ?? "").trim()
const isPostgres = url.startsWith("postgres://") || url.startsWith("postgresql://")

if (!existsSync(SQLITE) || !existsSync(PG)) {
  // Fichiers sources absents (ex. image Docker déjà construite) : on ne touche à rien.
  process.exit(0)
}

copyFileSync(isPostgres ? PG : SQLITE, TARGET)

// Vérifie que la cible correspond bien au dialecte voulu.
const check = readFileSync(TARGET, "utf8")
const hasProvider = check.includes(`provider = "${isPostgres ? "postgresql" : "sqlite"}"`)
if (!hasProvider) {
  writeFileSync(TARGET, check.replace(
    /provider = "(sqlite|postgresql)"/,
    `provider = "${isPostgres ? "postgresql" : "sqlite"}"`
  ))
}

console.log(`[schema] dialecte sélectionné : ${isPostgres ? "postgresql" : "sqlite"} (DATABASE_URL=${url.slice(0, 20)}…)`)
