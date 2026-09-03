/**
 * Vérification E2E de la PRODUCTION Vercel (gen3ia.online).
 * Sans clés LLM/Composio : vérifie que la structure est saine (inscriptions,
 * sessions, crédits, nouvelles tables v3.3 rendues, connecteurs fail-closed
 * avec messages explicites, tâches échouant proprement côté LLM).
 */
const BASE = process.env.BASE_URL ?? "https://gen3ia.online"
const rnd = Date.now()
const email = `prod_${rnd}@gen3ia.test`
const password = "E2eSecure!4567"

let cookies = ""
let failures = 0

async function call(method, path, body) {
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
  return { status: res.status, json }
}

function check(label, ok, detail) {
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`)
  if (!ok) failures++
}

console.log(`\n=== Vérification PRODUCTION sur ${BASE} ===\n`)

// 1. Health
const health = await call("GET", "/api/health")
check("GET /api/health", health.status === 200 && health.json?.ok === true,
  `v${health.json?.version} | db=${health.json?.database} | llm=${JSON.stringify(health.json?.llmProviders)} | connectors=${health.json?.connectors}`)

// 2. Inscription (crée les tables core au premier accès)
const reg = await call("POST", "/api/auth/register", { email, password, name: "E2E Prod" })
check("POST /api/auth/register", reg.status === 200 && reg.json?.ok === true, `crédits=${reg.json?.user?.credits ?? "?"}`)

// 3. Session
const me = await call("GET", "/api/auth/me")
check("GET /api/auth/me", me.status === 200 && me.json?.user?.email === email)

// 4. Marketplace (nouvelle table AgentListing v3.3 — devait 500 avant le fix DDL)
const market = await call("GET", "/api/marketplace")
check("GET /api/marketplace (table v3.3)", market.status === 200 && market.json?.ok === true,
  `${market.json?.listings?.length ?? 0} listing(s)`)

// 5. Watchdog (nouvelle table WatchConfig v3.3)
const watch = await call("GET", "/api/watchdog")
check("GET /api/watchdog (table v3.3)", watch.status === 200 && watch.json?.ok === true,
  `${watch.json?.watches?.length ?? 0} veille(s)`)

// 6. Agents
const agent = await call("POST", "/api/agents", {
  name: "Agent Prod E2E",
  description: "Agent de vérification production",
  systemPrompt: "Tu es un agent de test.",
})
check("POST /api/agents", agent.status === 200 && agent.json?.ok === true, `id=${(agent.json?.agent?.id ?? "").slice(0, 10)}`)

// 7. Connecteurs : moteur local (13 apps, import token sans config serveur)
{
  const apps = await call("GET", "/api/connectors/apps")
  check(
    "GET /api/connectors/apps (catalogue moteur local)",
    apps.status === 200 && apps.json?.ok === true && (apps.json?.apps?.length ?? 0) >= 13,
    `${apps.json?.apps?.length ?? 0} apps`
  )
}

// 8. Tâche sans clé LLM → échec PROPRE et explicite (fail-closed, pas de crash)
const task = await call("POST", "/api/tasks", {
  agentId: agent.json?.agent?.id,
  prompt: "Réponds en une phrase : quelle est la capitale du Cameroun ?",
})
check("POST /api/tasks (acceptée)", task.status === 200 && task.json?.ok === true, `id=${(task.json?.task?.id ?? "").slice(0, 10)}`)
const taskId = task.json?.task?.id

if (taskId) {
  // Sondage jusqu'à état terminal (max 60 s)
  let final = null
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 5000))
    const t = await call("GET", `/api/tasks/${taskId}`)
    final = t.json?.task
    if (["COMPLETED", "FAILED"].includes(final?.status)) break
  }
  if (final?.status === "COMPLETED") {
    check("Tâche COMPLETED (LLM présent !)", true, `coût=${final.costCredits}`)
  } else if (final?.status === "FAILED") {
    const explicit = /clé|key|fournisseur|provider/i.test(final.error ?? "")
    check("Tâche FAILED avec message LLM explicite (fail-closed)", explicit, (final.error ?? "").slice(0, 110))
  } else {
    check("Tâche atteint un état terminal", false, `statut=${final?.status}`)
  }
}

// 9. Facturation
const billing = await call("GET", "/api/billing")
check("GET /api/billing", billing.status === 200 && billing.json?.ok === true, `crédits=${billing.json?.credits?.balance ?? "?"}`)

// 10. Page connecteurs rendue
const page = await fetch(`${BASE}/connectors`, { redirect: "manual" })
check("GET /connectors (page)", page.status === 200, `${(await page.text()).length} octets`)

// 11. Guards admin avec session non-admin → refus (401/403)
const admin = await call("GET", "/api/admin/anomalies")
check("GET /api/admin/anomalies en non-admin → 401/403", admin.status === 401 || admin.status === 403, `HTTP ${admin.status}`)

const adminAnon = await fetch(`${BASE}/api/admin/anomalies`, { redirect: "manual" })
check("GET /api/admin/anomalies sans session → 401", adminAnon.status === 401)

const verdict = failures === 0
  ? "=== ✅ PRODUCTION SAINE — prête pour les clés ==="
  : `=== ❌ ${failures} échec(s) ===`
console.log(`\n${verdict}\n`)
process.exit(failures === 0 ? 0 : 1)
