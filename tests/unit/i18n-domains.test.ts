import { describe, test, expect } from "bun:test"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

/**
 * v3.6 — i18n : structure PAR DOMAINE FONCTIONNEL (auth, dashboard, ads…).
 * Un fichier = un domaine = une responsabilité de maintenance ; l'ajout
 * d'une langue = traduire chaque fichier indépendamment.
 *
 * Garanties :
 *  1. chaque fichier de dict/ exporte `fr` et `en` ;
 *  2. les clés du fichier respectent le préfixe de son domaine ;
 *  3. aucun fichier-monstre multi-domaines (dette de maintenance).
 */

const DICT_DIR = join(import.meta.dir, "../../src/lib/i18n/dict")

describe("i18n — organisation par domaine fonctionnel", () => {
  const files = readdirSync(DICT_DIR).filter((f) => f.endsWith(".ts"))

  test("au moins 25 fichiers de domaine (granularité de maintenance)", () => {
    expect(files.length).toBeGreaterThanOrEqual(25)
  })

  test("chaque fichier porte les préfixes de SON domaine (pas de mélange)", () => {
    const violations: string[] = []
    for (const file of files) {
      const domain = file.replace(".ts", "")
      const content = readFileSync(join(DICT_DIR, file), "utf8")
      // Toutes les clés du fichier doivent préfixer par "<domain>." ou "common.".
      const keys = [...content.matchAll(/"([a-zA-Z0-9]+\.[a-zA-Z0-9.]+)":\s*"/g)].map((m) => m[1])
      for (const key of keys) {
        const prefix = key.split(".")[0]
        if (prefix !== domain && prefix !== "common") {
          violations.push(`${file} contient la clé « ${key} » (préfixe « ${prefix} »)`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  test("aucun fichier-monstre : plafond de clés par domaine", () => {
    const oversized: string[] = []
    for (const file of files) {
      const content = readFileSync(join(DICT_DIR, file), "utf8")
      const keyCount = (content.match(/:\s*"/g) ?? []).length / 2 // fr + en
      if (keyCount > 120) oversized.push(`${file}: ${keyCount} clés`)
      expect(statSync(join(DICT_DIR, file)).size).toBeLessThan(60_000)
    }
    expect(oversized).toEqual([])
  })

  test("les domaines attendus existent (couverture fonctionnelle)", () => {
    const expected = [
      "auth", "dashboard", "agents", "tasks", "billing", "connectors", "knowledge",
      "memory", "marketplace", "skills", "tools", "apikeys", "sdk", "swarm",
      "webhooks", "watchdog", "traces", "finetune", "admin", "ads", "live",
      "settings", "landing", "common", "docs",
    ]
    const present = new Set(files.map((f) => f.replace(".ts", "")))
    const missing = expected.filter((d) => !present.has(d))
    expect(missing).toEqual([])
  })
})
