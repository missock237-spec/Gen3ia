/**
 * Test E2E réel des connecteurs sur le serveur de production (port 3001).
 * Vérifie : session, catalogue apps (fail-closed documenté sans clé),
 * connexions vides, initiation refusée proprement, page /connectors rendue,
 * et non-régression du pipeline LLM complet.
 */
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3001"
const rnd = Date.now()
const email = `e2econn_${rnd}@gen3ia.test`
const password = "E2eSecure!4567"

let cookies = ""
let failures = 0

async function call(method, path, body, expectOk = true) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookies ? { Cookie: cookies } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  })
  const setCookie = res.headers.get("set-cookie")
  if (setCookie) cookies = setCookie.split(";")[0]
  let json = null
  try { json = await res.json() } catch { /* HTML */ }
  const ok = expectOk ? res.ok && (json?.ok ?? true) : true
  if (!ok) {
    failures++
    console.log(`❌ ${method} ${path} → HTTP ${res.status}`, JSON.stringify(json)?.slice(0, 250))
  } else {
    console.log(`✅ ${method} ${path} → HTTP ${res.status}`)
  }
  return { status: res.status, json }
}

async function main() {
  console.log(`\n=== E2E Connecteurs GEN3IA sur ${BASE} ===\n`)

  // 1. Santé — connecteurs signalés « not-configured » (fail-closed honnête)
  const health = await call("GET", "/api/health")
  if (health.json?.connectors !== "not-configured") {
    failures++
    console.log("❌ health.connectors devrait être 'not-configured' sans clé")
  } else {
    console.log(`   Connecteurs: ${health.json.connectors} (attendu sans COMPOSIO_API_KEY)\n`)
  }

  // 2. Inscription + session
  await call("POST", "/api/auth/register", { name: "E2E Connecteurs", email, password })

  // 3. Catalogue apps — réponse structurée « non activé » (pas d'erreur brutale)
  const apps = await call("GET", "/api/connectors/apps?withCategories=true")
  if (apps.json?.configured !== false || !Array.isArray(apps.json?.apps)) {
    failures++
    console.log("❌ /api/connectors/apps doit renvoyer { configured: false, apps: [] } sans clé")
  } else {
    console.log(`   Message: ${String(apps.json.message).slice(0, 90)}…\n`)
  }

  // 4. Connexions — liste vide
  const conns = await call("GET", "/api/connectors/connections")
  if (!Array.isArray(conns.json?.connections) || conns.json.connections.length !== 0) {
    failures++
    console.log("❌ connexions initiales attendues vides")
  }

  // 5. Initiation d'une connexion sans clé → erreur 503 explicite (pas de simulacre)
  const init = await call("POST", "/api/connectors/connections", { toolkitSlug: "github" }, false)
  if (init.status !== 503 || !String(init.json?.error ?? "").includes("COMPOSIO_API_KEY")) {
    failures++
    console.log(`❌ initiation sans clé → HTTP ${init.status}`, JSON.stringify(init.json)?.slice(0, 200))
  } else {
    console.log(`   ✅ Échec explicite (503) : ${String(init.json.error).slice(0, 80)}…\n`)
  }

  // 6. Page /connectors rendue (HTML)
  const page = await fetch(`${BASE}/connectors`, { headers: { Cookie: cookies } })
  const html = await page.text()
  if (page.status !== 200 || !html.includes("GEN3IA")) {
    failures++
    console.log(`❌ page /connecteurs → HTTP ${page.status}`)
  } else {
    console.log(`✅ GET /connectors (page) → HTTP 200 (${html.length} octets)\n`)
  }

  // 7. Catalogue d'outils API : les outils Composio ABSENTS sans clé
  const tools = await call("GET", "/api/tools")
  const keys = tools.json?.tools?.map((t) => t.key) ?? []
  if (keys.includes("composio_execute")) {
    failures++
    console.log("❌ composio_execute ne doit pas apparaître sans COMPOSIO_API_KEY")
  } else {
    console.log(`   Outils exposés sans clé : ${keys.join(", ")}\n`)
  }

  // 8. NON-RÉGRESSION : pipeline LLM complet avec agent
  const agent = await call("POST", "/api/agents", {
    name: `Agent E2E Conn ${rnd}`,
    description: "Vérifie la non-régression du pipeline",
    systemPrompt: "Tu réponds en français, en une phrase.",
    category: "ANALYSE",
  })
  const task = await call("POST", "/api/tasks", {
    agentId: agent.json?.agent?.id,
    prompt: "Réponds en une phrase : combien font 12 × 8 ?",
  })
  const taskId = task.json?.task?.id
  let final = null
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 3000))
    const t = await call("GET", `/api/tasks/${taskId}`)
    const st = t.json?.task?.status
    if (["COMPLETED", "FAILED", "REJECTED"].includes(st)) { final = t.json?.task; break }
  }
  if (final?.status === "COMPLETED") {
    console.log(`✅ Pipeline LLM : COMPLETED (coût ${final.costCredits} crédits)\n`)
  } else {
    failures++
    console.log(`❌ Pipeline LLM : ${final?.status ?? "timeout"}`)
  }

  console.log(`=== RÉSULTAT : ${failures === 0 ? "✅ CONNECTEURS INTÉGRÉS + PIPELINE OK" : `❌ ${failures} échec(s)`} ===\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error("ERREUR FATALE:", e.message); process.exit(1) })
