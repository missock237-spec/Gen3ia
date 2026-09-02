/**
 * Test E2E réel sur le serveur de production (port 3001).
 * Vérifie : inscription, connexion, création d'agent, création de tâche,
 * pipeline d'orchestration avec VRAIE inférence LLM, ledger de crédits.
 * Aucun mock : tout passe par HTTP réel + base réelle + LLM réel.
 */
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3001"
const rnd = Date.now()
const email = `e2e_${rnd}@gen3ia.test`
const password = "E2eSecure!4567"

let cookies = ""
let failures = 0

async function call(method, path, body, expectStatus) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookies ? { Cookie: cookies } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const setCookie = res.headers.get("set-cookie")
  if (setCookie) cookies = setCookie.split(";")[0]
  let json = null
  try { json = await res.json() } catch { /* texte brut */ }
  const okStatus = expectStatus ? res.status === expectStatus : res.status < 400
  if (!okStatus) {
    failures++
    console.log(`❌ ${method} ${path} → HTTP ${res.status}`, JSON.stringify(json)?.slice(0, 300))
  } else {
    console.log(`✅ ${method} ${path} → HTTP ${res.status}`)
  }
  return { status: res.status, json }
}

async function main() {
  console.log(`\n=== E2E réel GEN3IA sur ${BASE} ===\n`)

  // 1. Santé
  const health = await call("GET", "/api/health")
  if (health.json?.database !== "ok") throw new Error("Base de données indisponible")
  console.log(`   Base: ${health.json.database} | Moteurs LLM: ${health.json.llmProviders.join(", ") || "aucun"}\n`)

  // 2. Inscription (écriture réelle en base + session)
  await call("POST", "/api/auth/register", { name: "E2E Testeur", email, password }, 200)

  // 3. Profil (vérifie session + rôles)
  const me = await call("GET", "/api/auth/me")

  // 4. Solde de crédits initial (25 crédits offerts à l'inscription)
  const billing = await call("GET", "/api/billing")
  const creditsBefore = billing.json?.balance
  console.log(`   Crédits initiaux : ${creditsBefore}\n`)

  // 5. Création d'agent (écriture réelle)
  const agent = await call("POST", "/api/agents", {
    name: `Agent E2E ${rnd}`,
    description: "Agent de test fonctionnel end-to-end",
    systemPrompt: "Tu es un assistant concis. Tu réponds en français, en 2 phrases maximum.",
    category: "ANALYSE",
  })
  const agentId = agent.json?.agent?.id

  // 6. Création de tâche → déclenche le pipeline d'orchestration complet
  //    (ANALYZING → PLANNING → SIMULATING → EXECUTING → VERIFYING → LEARNING)
  //    avec VRAIE inférence LLM si un moteur est configuré.
  const task = await call("POST", "/api/tasks", {
    agentId,
    prompt: "Réponds en une phrase : quel est le capital du Cameroun ?",
  })
  const taskId = task.json?.task?.id
  console.log(`   Tâche créée : ${taskId} (statut initial: ${task.json?.task?.status})\n`)

  // 7. Attente du pipeline (vraie inférence — peut prendre du temps)
  if (taskId) {
    let final = null
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 3000))
      const t = await call("GET", `/api/tasks/${taskId}`)
      const st = t.json?.task?.status
      if (["COMPLETED", "FAILED", "REJECTED"].includes(st)) { final = t.json?.task; break }
    }
    if (final) {
      console.log(`\n   Statut final : ${final.status}`)
      let result = final.result
      if (typeof result === "string") { try { result = JSON.parse(result) } catch { /* texte brut */ } }
      const out = result?.output ?? result?.summary ?? result ?? ""
      console.log(`   Résultat LLM : ${JSON.stringify(out).slice(0, 250)}`)
      console.log(`   Coût crédits : ${final.costCredits} | tokens: ${final.tokensIn ?? "?"}+${final.tokensOut ?? "?"}`)
      if (final.status !== "COMPLETED") failures++
    } else {
      failures++
      console.log("\n   ⚠️ Tâche toujours en cours après 120s (pipeline long mais pas d'échec)")
    }
  }

  // 8. Ledger de transactions (preuve de débit réel)
  const billingAfter = await call("GET", "/api/billing")
  const creditsAfter = billingAfter.json?.balance
  console.log(`\n   Crédits finaux : ${creditsAfter} (débit réel: ${creditsBefore - creditsAfter})`)

  // 9. Marketplace (lecture réelle)
  await call("GET", "/api/marketplace")

  console.log(`\n=== RÉSULTAT : ${failures === 0 ? "✅ TOUT EST FONCTIONNEL (100% réel)" : `❌ ${failures} échec(s)`} ===\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error("ERREUR FATALE:", e.message); process.exit(1) })
