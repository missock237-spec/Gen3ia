/**
 * Test du contrat API Composio — sans clé : fail-closed ; avec une vraie
 * clé (COMPOSIO_API_KEY) : appels réels au catalogue public.
 * Usage : bun scripts/test-composio-api.ts
 */
export {} // module ES (top-level await)

const { isComposioConfigured, listToolkits, listTools } = await import("../src/lib/connectors/composio/client")

console.log("Composio configuré :", isComposioConfigured())

if (!isComposioConfigured()) {
  console.log("→ fail-closed confirmé (aucune clé). Pour tester le catalogue réel :")
  console.log("  COMPOSIO_API_KEY=sk-... bun scripts/test-composio-api.ts")
  process.exit(0)
}

try {
  const apps = await listToolkits({ limit: 5, sort_by: "usage" })
  console.log(`✅ Catalogue accessible : ${apps.total_items} apps au total. Top 5 :`)
  for (const t of apps.items) {
    console.log(`   - ${t.slug} (${t.name}) — ${String(t.meta?.description ?? "").slice(0, 60)}`)
  }
  const actions = await listTools({ toolkit: "github", limit: 5 })
  console.log(`✅ Actions GitHub (${actions.total_items} au total). Exemples :`)
  for (const a of actions.items) {
    console.log(`   - ${a.slug} : ${a.description.slice(0, 60)}`)
  }
  process.exit(0)
} catch (err) {
  console.error("❌", err instanceof Error ? err.message : String(err))
  process.exit(1)
}
