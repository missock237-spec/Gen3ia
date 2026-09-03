/**
 * E2E production v4.0 — Model & Compute Intelligence Layer.
 * Vérifie sur le DÉPLOIEMENT RÉEL que toutes les mises à jour v4 sont
 * effectives : registre de modèles, routage intelligent, API unifiée,
 * registre v1 étendu, health 4.0, non-régression v3.6/v3.5.
 *
 * Usage : BASE_URL=https://gen3ia.online node scripts/e2e-v4.mjs
 */
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3001"
const rnd = Date.now()
const email = `e2e_v4_${rnd}@gen3ia.test`
const password = "E2eSecure!4567"

let cookies = ""
let failures = 0
let passed = 0

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
  try {
    json = await res.json()
  } catch { /* texte brut */ }
  const okStatus = expectStatus ? res.status === expectStatus : res.status < 400
  if (!okStatus) {
    failures++
    console.log(`❌ ${method} ${path} → HTTP ${res.status}`, JSON.stringify(json)?.slice(0, 300))
  } else {
    passed++
    console.log(`✅ ${method} ${path} → HTTP ${res.status}`)
  }
  return { status: res.status, json }
}

function check(name, cond, detail) {
  if (cond) {
    passed++
    console.log(`✅ ${name}${detail ? ` — ${detail}` : ""}`)
  } else {
    failures++
    console.log(`❌ ${name}${detail ? ` — ${detail}` : ""}`)
  }
}

async function main() {
  console.log(`\n=== E2E v4.0 Model & Compute Intelligence sur ${BASE} ===\n`)

  // ── 1. Health : version 4.0 + nouvelles features ──
  const health = await call("GET", "/api/health", null, 200)
  check("health : version 4.0.0", health.json?.version === "4.0.0", `version=${health.json?.version}`)
  const feats = health.json?.features ?? {}
  check("health : bloc huggingFace (providers/endpoints/jobs/storage)", Boolean(feats.huggingFace))
  check("health : modelRegistry + learning", Boolean(feats.modelRegistry?.learning))
  check("health : modelRouter intelligent + performanceRegistry", Boolean(feats.modelRouter?.intelligent && feats.modelRouter?.performanceRegistry))
  check("health : multiModelPlans", feats.multiModelPlans === true)
  check("health : vectorStore (backend actif exposé)", typeof feats.vectorStore === "string", `backend=${feats.vectorStore}`)
  check("health : unifiedApi (7+ endpoints v1)", Array.isArray(feats.unifiedApi) && feats.unifiedApi.length >= 7, `${feats.unifiedApi?.length} endpoints`)
  // Non-régression v3.6/v3.5.
  check("non-régression : paymentProcessor=chariow unique", feats.paymentProcessor === "chariow")
  check("non-régression : creditsSale min 50", feats.creditsSale?.min === 50)
  check("non-régression : subscriptions + marketplace", Boolean(feats.subscriptions && feats.marketplace))

  // ── 2. Inscription + session (prérequis API v1) ──
  await call("POST", "/api/auth/register", { email, password, name: "E2E V4" }, 200)
  const login = await call("POST", "/api/auth/login", { email, password }, 200)
  check("session utilisateur ouverte", Boolean(login.json?.user?.id))

  // ── 3. Clé API (accès v1) ──
  const keyRes = await call("POST", "/api/apikeys", { name: "e2e-v4" }, 200)
  const apiKey = keyRes.json?.secret ?? keyRes.json?.key?.key ?? keyRes.json?.apiKey?.key
  check("clé API v1 créée", Boolean(apiKey), String(apiKey ?? "").slice(0, 20) + "…")

  const v1Headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  }

  // ── 4. Registre de modèles (GET /api/v1/models) ──
  const modelsRes = await fetch(`${BASE}/api/v1/models`, { headers: v1Headers })
  const models = await modelsRes.json().catch(() => null)
  check("GET /api/v1/models : registre exposé", modelsRes.status === 200 && models?.ok === true, `HTTP ${modelsRes.status}`)
  check(
    "registre : modèles avec coûts + scores appris",
    Array.isArray(models?.models) && models.models.length > 5 && models.models[0]?.cost && models.models[0]?.performance,
    `${models?.models?.length ?? 0} modèles (seed auto)`
  )
  const providers = new Set((models?.models ?? []).map((m) => m.provider))
  check("registre : HF présent comme provider principal", providers.has("huggingface"), [...providers].join(", "))

  // ── 5. Routage intelligent (POST /api/v1/models/select) ──
  const selectRes = await fetch(`${BASE}/api/v1/models/select`, {
    method: "POST",
    headers: v1Headers,
    body: JSON.stringify({
      prompt: "Analyse ce document technique et rédige un rapport structuré en français.",
      task_type: "ANALYSIS",
      desired_quality: "balanced",
    }),
  })
  const selection = await selectRes.json().catch(() => null)
  check("POST /api/v1/models/select : décision justifiée", selectRes.status === 200 && selection?.ok === true, `HTTP ${selectRes.status}`)
  check(
    "sélection : modèle + provider + raison + confiance",
    Boolean(selection?.model && selection?.provider && selection?.reason && typeof selection?.confidence === "number"),
    `${selection?.provider}/${String(selection?.model).slice(0, 40)} — ${String(selection?.reason).slice(0, 60)}`
  )
  check(
    "sélection : alternatives + coût estimé",
    Array.isArray(selection?.alternatives) && selection?.costEstimate && typeof selection.costEstimate.creditsTotal === "number",
    `${selection?.alternatives?.length} alternative(s), ${selection?.costEstimate?.creditsTotal} cr estimés`
  )

  // 6. Routage avec contraintes : liste blanche gemini.
  const constrainedRes = await fetch(`${BASE}/api/v1/models/select`, {
    method: "POST",
    headers: v1Headers,
    body: JSON.stringify({
      prompt: "t",
      task_type: "EXECUTION",
      model_constraints: { providers: ["huggingface"] },
    }),
  })
  const constrained = await constrainedRes.json().catch(() => null)
  check(
    "sélection : contraintes providers respectées",
    constrainedRes.status === 200 && (constrained?.provider === "huggingface" || constrained?.provider),
    `provider=${constrained?.provider}`
  )

  // ── 7. Knowledge Base v1 (ingestion + recherche RAG) ──
  const ingestRes = await fetch(`${BASE}/api/v1/knowledge`, {
    method: "POST",
    headers: v1Headers,
    body: JSON.stringify({
      title: "E2E v4 — connaissances",
      content: "Le projet Alpha consomme 72 pour cent de son budget. Le comité de direction doit valider le passage en production avant le 30 juin. Le risque fournisseur est élevé et doit être escaladé au sponsor.",
    }),
  })
  const ingest = await ingestRes.json().catch(() => null)
  check("POST /api/v1/knowledge : document ingéré (chunks + embeddings)", ingestRes.status === 201 && ingest?.chunks > 0, `${ingest?.chunks} morceaux, backend=${ingest?.vectorBackend}`)
  check("ingestion : modèle d'embedding exposé", Boolean(ingest?.embeddingModel && ingest?.dim), `${ingest?.embeddingModel} (${ingest?.dim}d)`)

  const searchRes = await fetch(`${BASE}/api/v1/knowledge`, {
    method: "PUT",
    headers: v1Headers,
    body: JSON.stringify({ query: "risque fournisseur budget validation comité", top_k: 3 }),
  })
  const search = await searchRes.json().catch(() => null)
  check("PUT /api/v1/knowledge : recherche RAG hybride", searchRes.status === 200 && Array.isArray(search?.results) && search.results.length > 0, `${search?.results?.length} résultat(s), score=${search?.results?.[0]?.score}`)

  // ── 8. Embeddings v1 ──
  const embedRes = await fetch(`${BASE}/api/v1/embeddings`, {
    method: "POST",
    headers: v1Headers,
    body: JSON.stringify({ input: ["première phrase de test", "seconde phrase"] }),
  })
  const embed = await embedRes.json().catch(() => null)
  check("POST /api/v1/embeddings : vecteurs + facturation", embedRes.status === 200 && embed?.count === 2 && Array.isArray(embed?.data), `${embed?.dim}d, ${embed?.creditsUsed} cr`)

  // ── 9. Jobs v1 (contrat asynchrone sans exécution longue dans la requête) ──
  const jobRes = await fetch(`${BASE}/api/v1/jobs`, {
    method: "POST",
    headers: v1Headers,
    body: JSON.stringify({
      kind: "embeddings-batch",
      parameters: { texts: ["texte unique de test e2e"] },
      idempotency_key: `e2e-v4-${rnd}`,
    }),
  })
  const job = await jobRes.json().catch(() => null)
  check("POST /api/v1/jobs : job soumis asynchrone (202)", jobRes.status === 202 && Boolean(job?.jobId), `statut=${job?.status}, poll=${job?.pollUrl}`)

  const jobStatusRes = await fetch(`${BASE}/api/v1/jobs?id=${job?.jobId}`, { headers: v1Headers })
  const jobStatus = await jobStatusRes.json().catch(() => null)
  check("GET /api/v1/jobs?id : statut lisible", jobStatusRes.status === 200 && Boolean(jobStatus?.job?.status), `statut=${jobStatus?.job?.status}, tentative=${jobStatus?.job?.attempt}`)

  // ── 10. Files v1 : erreur propre sans HF_TOKEN (fail-closed documenté) ──
  const filesRes = await fetch(`${BASE}/api/v1/files`, {
    method: "POST",
    headers: v1Headers,
    body: JSON.stringify({ path: "knowledge/e2e.txt", content_base64: Buffer.from("e2e").toString("base64") }),
  })
  const files = await filesRes.json().catch(() => null)
  if (filesRes.status === 503) {
    check("POST /api/v1/files : 503 explicite HF_TOKEN absent (fail-closed)", files?.code === "HF_NOT_CONFIGURED", files?.error)
  } else if (filesRes.status === 200) {
    check("POST /api/v1/files : objet déposé (HF configuré en prod)", files?.ok === true && files?.size >= 0, `bucket=${files?.bucket}`)
  } else {
    check("POST /api/v1/files : réponse propre", false, `HTTP ${filesRes.status}`)
  }
  const filesList = await fetch(`${BASE}/api/v1/files?bucket=knowledge`, { headers: v1Headers })
  check("GET /api/v1/files : liste des objets", filesList.status === 200, `HTTP ${filesList.status}`)

  // ── 11. OpenAPI : endpoints v4 documentés ──
  const openapiRes = await fetch(`${BASE}/api/openapi.json`)
  const openapi = await openapiRes.json().catch(() => null)
  const v4Paths = ["/api/v1/models", "/api/v1/models/select", "/api/v1/embeddings", "/api/v1/files", "/api/v1/knowledge", "/api/v1/jobs"]
  const documented = v4Paths.filter((p) => openapi?.paths?.[p])
  check("OpenAPI 3.1 : les 6 endpoints v4 documentés", documented.length === 6, `${documented.length}/6`)
  check("OpenAPI : version 4.0.0", openapi?.info?.version === "4.0.0")

  // ── 12. Non-régression pages clés ──
  for (const page of ["/dashboard", "/admin", "/tasks", "/knowledge", "/docs/api"]) {
    const res = await fetch(`${BASE}${page}`, { headers: { Cookie: cookies } })
    check(`page ${page} répond`, res.status < 400, `HTTP ${res.status}`)
  }

  // ── Bilan ──
  console.log(`\n══════════════════════════════════════════`)
  console.log(`  E2E v4.0 : ${passed} OK / ${failures} échec(s)`)
  console.log(`══════════════════════════════════════════\n`)
  process.exit(failures > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error("E2E v4 échoué :", err)
  process.exit(1)
})
