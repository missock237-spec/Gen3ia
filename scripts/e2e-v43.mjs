/**
 * E2E v4.3 — Action Gateway (ADR-0017) : permissions, risque,
 * vérification, exécutions persistées, tool discovery, HITL action.
 *
 * Vérifie sur le déploiement réel (ou local) que :
 *  1. health expose version 4.3.0 + actionGateway ;
 *  2. les nouvelles routes répondent 401 sans session ;
 *  3. Tool Discovery classe apps/actions avec risque ;
 *  4. permissions : création, liste, plafond, DENY, révocation ;
 *  5. gateway : exécution structurée FAILED (sans connexion) avec
 *     executionId + risque + trace ; CONFIRMATION_REQUIRED pour HIGH ;
 *     confirmation refusée → REJECTED ; audit persisté ;
 *  6. exécutions : historique filtrable.
 *
 * Usage : node scripts/e2e-v43.mjs
 *         BASE_URL=https://gen3ia.online node scripts/e2e-v43.mjs
 */
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000"
const rnd = Date.now()
const email = `e2e_v43_${rnd}@gen3ia.test`
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
    redirect: "manual",
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
  console.log(`\n=== E2E v4.3 Action Gateway sur ${BASE} ===\n`)

  // ── 1. Health : version + features actionGateway ──
  const health = await call("GET", "/api/health", null, 200)
  check("health : version 4.3.0", health.json?.version === "4.3.0", `version=${health.json?.version}`)
  const gw = health.json?.features?.actionGateway
  check("health : actionGateway (riskEngine, permissions, hitl, verification, audit, trace, toolDiscovery)", Boolean(
    gw?.riskEngine && gw?.permissions && gw?.hitl && gw?.verification && gw?.audit && gw?.trace && gw?.toolDiscovery
  ))

  // ── 2. Guards : 401 sans session sur les nouvelles routes ──
  const noSession = { ...(cookies ? {} : {}), Cookie: "" }
  const saved = cookies
  cookies = ""
  await call("GET", "/api/connectors/executions", null, 401)
  await call("GET", "/api/connectors/permissions", null, 401)
  await call("GET", "/api/connectors/discover?q=gmail", null, 401)
  await call("POST", "/api/connectors/executions/fake/confirm", { approved: true }, 401)
  cookies = saved

  // ── 3. Session utilisateur ──
  await call("POST", "/api/auth/register", { email, password, name: "E2E V43" }, 200)
  const login = await call("POST", "/api/auth/login", { email, password }, 200)
  check("session utilisateur ouverte", Boolean(login.json?.user?.id))

  // ── 4. Tool Discovery ──
  const disc = await call("GET", "/api/connectors/discover?q=analyser%20mes%20emails%20gmail%20et%20creer%20des%20taches%20dans%20notion", null, 200)
  const apps = disc.json?.apps ?? []
  const tools = disc.json?.tools ?? []
  check("découverte : gmail + notion classés parmi les apps pertinentes", apps.some((a) => a.slug === "gmail") && apps.some((a) => a.slug === "notion"), `${apps.length} apps`)
  check("découverte : actions avec niveau de risque", tools.length > 0 && tools.every((t) => ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(t.risk)), `${tools.length} actions`)
  check("découverte : send_email évalué HIGH", tools.some((t) => t.appSlug === "gmail" && t.actionSlug === "send_email" && t.risk === "HIGH"))

  // ── 5. Permissions : cycle complet ──
  await call("POST", "/api/connectors/permissions", {
    appSlug: "github", actionPattern: "github.*", effect: "ALLOW", riskFloor: "HIGH", note: "e2e",
  }, 200)
  const perms = await call("GET", "/api/connectors/permissions", null, 200)
  const grant = (perms.json?.permissions ?? []).find((p) => p.appSlug === "github" && p.riskFloor === "HIGH")
  check("permissions : grant github.* HIGH listé", Boolean(grant))

  // DENY prioritaire sur une action précise.
  await call("POST", "/api/connectors/permissions", {
    appSlug: "github", actionPattern: "github.merge_pull_request", effect: "DENY", riskFloor: "LOW",
  }, 200)

  // ── 6. Gateway : DENY → rejet documenté, aucun appel réseau ──
  const denied = await call("POST", "/api/connectors/execute", {
    appSlug: "github", actionSlug: "merge_pull_request", params: { owner: "o", repo: "r", pull_number: 1 },
  }, 200)
  check("gateway : DENY → ok=false + executionStatus REJECTED + executionId", Boolean(
    denied.json?.ok === false && denied.json?.executionStatus === "REJECTED" && denied.json?.executionId
  ), denied.json?.permission?.reason?.slice(0, 80))

  // ── 7. Gateway : exécution sans connexion → FAILED tracé ──
  const failed = await call("POST", "/api/connectors/execute", {
    appSlug: "slack", actionSlug: "create_channel", params: { name: "e2e" },
  }, 200)
  check("gateway : sans connexion → FAILED + risque MEDIUM + executionId", Boolean(
    failed.json?.ok === false && failed.json?.executionStatus === "FAILED" && failed.json?.executionId && failed.json?.risk?.level === "MEDIUM"
  ), failed.json?.error?.slice(0, 80))

  // ── 8. Gateway : HIGH → CONFIRMATION_REQUIRED puis refus → REJECTED ──
  const confirmReq = await call("POST", "/api/connectors/execute", {
    appSlug: "calendar", actionSlug: "delete_event", params: { eventId: "e2e_evt" },
  }, 200)
  check("gateway : CRITICAL → CONFIRMATION_REQUIRED + paramsPreview rédigée", Boolean(
    confirmReq.json?.executionStatus === "CONFIRMATION_REQUIRED" && confirmReq.json?.confirmation?.paramsPreview
  ), confirmReq.json?.error?.slice(0, 80))
  const execId = confirmReq.json?.executionId
  if (execId) {
    const rejected = await call("POST", `/api/connectors/executions/${execId}/confirm`, { approved: false, reason: "e2e refuse" }, 200)
    check("confirmation refusée → REJECTED", rejected.json?.executionStatus === "REJECTED")
  }

  // ── 9. Historique : exécutions listées avec trace ──
  const history = await call("GET", "/api/connectors/executions?limit=50", null, 200)
  const items = history.json?.executions ?? []
  check("exécutions : historique non vide avec risques", items.length >= 3 && items.every((e) => e.riskLevel))
  const rejectedItem = items.find((e) => e.id === execId)
  check("exécutions : demande confirmée visible en REJECTED", Boolean(rejectedItem && rejectedItem.status === "REJECTED"))

  // Détail complet d'une exécution.
  if (items[0]) {
    const detail = await call("GET", `/api/connectors/executions/${items[0].id}`, null, 200)
    check("exécutions : détail (raisons de risque + permission)", Boolean(
      detail.json?.execution?.riskReasons && detail.json?.execution?.permission
    ))
  }

  // ── 10. Révocation de permission ──
  if (grant) {
    await call("DELETE", `/api/connectors/permissions/${grant.id}`, null, 200)
    const after = await call("GET", "/api/connectors/permissions", null, 200)
    check("permissions : révocation effective", !(after.json?.permissions ?? []).some((p) => p.id === grant.id))
  }

  // ── 11. Page connecteurs rendue avec la section Gateway ──
  const page = await fetch(`${BASE}/connectors`, { headers: { Cookie: cookies }, redirect: "manual" })
  check("page /connectors répond 200", page.status === 200, `HTTP ${page.status}`)

  console.log(`\n=== ${passed} succès / ${failures} échecs ===\n`)
  process.exit(failures > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error("E2E v4.3 en erreur :", err)
  process.exit(1)
})
