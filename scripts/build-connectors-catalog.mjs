/**
 * Convertit le catalogue public Composio (docs/public/data/toolkits.json,
 * dépôt MIT ComposioHQ/composio — 1467 apps, 51240 outils) en fichiers
 * sources compacts pour GEN3IA :
 *
 *   src/lib/connectors/catalog/apps.json       — métadonnées des 1467 apps
 *   src/lib/connectors/catalog/tools/chunk-*.json — outils par lots (détail à la demande)
 *
 * Exécution : node scripts/build-connectors-catalog.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"

const SRC = "research/composio/docs/public/data/toolkits.json"
const OUT = "src/lib/connectors/catalog"
const TOOLS_DIR = `${OUT}/tools`

if (!existsSync(SRC)) {
  console.error(`[catalog] source introuvable : ${SRC} (cloner ComposioHQ/composio d'abord)`)
  process.exit(1)
}

const raw = JSON.parse(readFileSync(SRC, "utf8"))

// 1. Métadonnées applicatives (sans les outils — ~1 Mo).
const apps = raw.map((t) => ({
  slug: t.slug,
  name: t.name,
  logo: t.logo ?? null,
  description: t.description ?? null,
  category: t.category ?? "other",
  authSchemes: (t.authSchemes ?? []).filter(Boolean),
  composioManaged: (t.composioManagedAuthSchemes ?? []).filter(Boolean),
  toolCount: t.toolCount ?? (t.tools?.length ?? 0),
  triggerCount: t.triggerCount ?? (t.triggers?.length ?? 0),
  version: t.version ?? null,
}))

// Tri alphabétique, catégories cohérentes.
apps.sort((a, b) => a.name.localeCompare(b.name))

mkdirSync(TOOLS_DIR, { recursive: true })
writeFileSync(`${OUT}/apps.json`, JSON.stringify(apps))
console.log(`[catalog] apps.json : ${apps.length} apps (${(JSON.stringify(apps).length / 1024 / 1024).toFixed(2)} Mo)`)

// 2. Outils + déclencheurs par lots de 120 apps (détail chargé à la demande).
const CHUNK = 120
const withTools = raw.map((t) => ({
  slug: t.slug,
  tools: (t.tools ?? []).map((x) => ({
    slug: x.slug,
    name: x.name,
    description: x.description ?? null,
  })),
  triggers: (t.triggers ?? []).map((x) => ({
    slug: x.slug,
    name: x.name,
    description: x.description ?? null,
  })),
}))

let totalTools = 0
let totalTriggers = 0
for (let i = 0; i < withTools.length; i += CHUNK) {
  const part = withTools.slice(i, i + CHUNK)
  totalTools += part.reduce((n, a) => n + a.tools.length, 0)
  totalTriggers += part.reduce((n, a) => n + a.triggers.length, 0)
  const idx = Math.floor(i / CHUNK)
  writeFileSync(`${TOOLS_DIR}/chunk-${String(idx).padStart(2, "0")}.json`, JSON.stringify(part))
}
const chunks = Math.ceil(withTools.length / CHUNK)
console.log(`[catalog] tools/ : ${chunks} lots — ${totalTools} outils, ${totalTriggers} déclencheurs`)

// 3. Index d'imports STATIQUES (webpack/Next ne résout pas les require dynamiques).
const imports = []
const arrayEntries = []
for (let i = 0; i < chunks; i++) {
  imports.push(`import chunk${String(i).padStart(2, "0")} from "./tools/chunk-${String(i).padStart(2, "0")}.json"`)
  arrayEntries.push(`  chunk${String(i).padStart(2, "0")},`)
}
const tsModule = `// @generated — ne pas éditer (scripts/build-connectors-catalog.mjs)
// Imports statiques des lots d'outils du catalogue (chargés côté serveur).
${imports.join("\n")}

export type ChunkEntry = {
  slug: string
  tools: Array<{ slug: string; name: string; description: string | null }>
  triggers: Array<{ slug: string; name: string; description: string | null }>
}

export const TOOL_CHUNKS: ChunkEntry[][] = [
${arrayEntries.join("\n")}
]
`
writeFileSync(`${OUT}/tools-chunks.ts`, tsModule)
console.log(`[catalog] tools-chunks.ts : ${chunks} imports statiques`)

// 4. Index slug → lot (résolution directe).
const index = {}
withTools.forEach((a, i) => {
  index[a.slug] = Math.floor(i / CHUNK)
})
writeFileSync(`${OUT}/tools-index.json`, JSON.stringify(index))
console.log(`[catalog] tools-index.json : ${Object.keys(index).length} entrées`)
