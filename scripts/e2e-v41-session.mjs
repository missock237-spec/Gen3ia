#!/usr/bin/env node
/**
 * Prépare la session Playwright partagée pour les tests UI v4.1.
 *
 * Stratégie anti-429 (limite 5 inscriptions/h/IP) :
 *  1. si E2E_EMAIL est fourni → connexion à ce compte ;
 *  2. sinon inscription d'un nouveau compte ;
 *  3. si l'inscription est limitée (429) → erreur explicite.
 *
 * Écrit le storageState Playwright (cookies) consommé par
 * tests/e2e/v41-ui.spec.ts.
 *
 * Usage : E2E_EMAIL=... node scripts/e2e-v41-session.mjs [baseURL]
 */
import { writeFileSync } from "node:fs"

const BASE = process.argv[2] ?? process.env.BASE_URL ?? "http://localhost:3000"
const STATE_FILE = "tests/e2e/.v41-session.json"
const PASSWORD = process.env.E2E_PASSWORD ?? "E2e!Gen3ia#2026"

function writeState(res) {
  const setCookie = res.headers.get("set-cookie") ?? ""
  const cookies = setCookie
    .split(/,(?=[^;]+=)/)
    .map((raw) => raw.split(";")[0].trim())
    .filter(Boolean)
    .map((pair) => {
      const [name, value] = pair.split("=")
      return {
        name,
        value,
        domain: "localhost",
        path: "/",
        expires: -1,
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      }
    })
  if (cookies.length === 0) throw new Error("Aucun cookie de session reçu")
  writeFileSync(STATE_FILE, JSON.stringify({ cookies, origins: [] }, null, 2))
  console.log(`session v4.1 : storageState écrit (${cookies.length} cookie(s)) → ${STATE_FILE}`)
}

async function login(email) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  if (res.ok) {
    writeState(res)
    console.log(`session v4.1 : connexion à ${email} OK`)
    return true
  }
  return false
}

// 1. Compte existant fourni ?
if (process.env.E2E_EMAIL) {
  if (await login(process.env.E2E_EMAIL)) {
    await purgeArchivedE2EAgents(process.env.E2E_EMAIL)
    process.exit(0)
  }
  throw new Error(`Login échoué pour ${process.env.E2E_EMAIL}`)
}

/** Nettoie les agents E2E archivés (purge test — uniquement avec accès base locale). */
async function purgeArchivedE2EAgents() {
  try {
    const { PrismaClient } = await import("@prisma/client")
    const db = new PrismaClient()
    const users = await db.user.findMany({ where: { email: { startsWith: "e2e" } }, select: { id: true } })
    const ids = users.map((u) => u.id)
    if (ids.length > 0) {
      const deleted = await db.agent.deleteMany({ where: { userId: { in: ids }, name: { startsWith: "E2E" } } })
      console.log(`session v4.1 : purge agents E2E (${deleted.count} supprimés — quota libéré)`)
    }
    await db.$disconnect()
  } catch {
    console.log("session v4.1 : purge agents E2E ignorée (base locale indisponible)")
  }
}

// 2. Nouvelle inscription.
const email = `e2e.v41.ui.${Date.now()}@gen3ia.test`
const res = await fetch(`${BASE}/api/auth/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "E2E V41 UI", email, password: PASSWORD }),
})
if (res.ok) {
  writeState(res)
  console.log(`session v4.1 : inscription OK (${email})`)
  process.exit(0)
}
if (res.status === 429) {
  console.error("Inscription limitée (429) : fournissez E2E_EMAIL d'un compte e2e existant.")
  process.exit(2)
}
throw new Error(`Inscription échouée : HTTP ${res.status}`)
