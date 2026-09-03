/**
 * Fixture E2E — crée (ou réutilise) l'utilisateur de session des parcours
 * Playwright directement en base (hash scrypt identique au registre).
 * Usage : bun scripts/e2e-seed-user.ts
 * Contourne uniquement la limite d'INSCRIPTION (5/h/IP) pour l'itération
 * locale : le login reste un appel API réel dans les specs.
 */
import crypto from "node:crypto"
import { PrismaClient } from "@prisma/client"

const KEYLEN = 64

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(password, salt, KEYLEN)
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`
}

const EMAIL = process.argv[2]
const PASSWORD = process.argv[3] ?? "E2e!Gen3ia#2026"
const NAME = process.argv[4] ?? "E2E Journeys"

if (!EMAIL) {
  console.error("Usage : bun scripts/e2e-seed-user.ts <email> [password] [name]")
  process.exit(1)
}

const db = new PrismaClient()

async function main() {
  const existing = await db.user.findUnique({ where: { email: EMAIL.toLowerCase() } })
  if (existing) {
    console.log(JSON.stringify({ ok: true, created: false, email: existing.email, id: existing.id }))
    return
  }
  const user = await db.user.create({
    data: {
      email: EMAIL.toLowerCase(),
      name: NAME,
      passwordHash: hashPassword(PASSWORD),
      credits: 25,
    },
  })
  console.log(JSON.stringify({ ok: true, created: true, email: user.email, id: user.id }))
}

main()
  .catch((err) => {
    console.error("Erreur :", err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
