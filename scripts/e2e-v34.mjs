/**
 * Vérification E2E v3.4 en production : catalogue 1467 apps,
 * mode live (session + signalisation), garde-fous OAuth login.
 */
const BASE = process.env.BASE_URL ?? "https://gen3ia.online"
const rnd = Date.now()
const email = `v34_${rnd}@gen3ia.test`
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
  try {
    json = await res.json()
  } catch {
    /* HTML */
  }
  return { status: res.status, json }
}

function check(label, ok, detail) {
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`)
  if (!ok) failures++
}

console.log(`\n=== Vérification v3.4 PRODUCTION sur ${BASE} ===\n`)

// 0. Setup : compte + session
const reg = await call("POST", "/api/auth/register", { name: "E2E v3.4", email, password })
check("POST /api/auth/register", reg.status === 200 && reg.json?.ok === true, `crédits=${reg.json?.user?.credits}`)

// 1. Catalogue : stats
const stats = await call("GET", "/api/connectors/catalog?stats=1")
check(
  "GET catalogue stats — 1467 apps / 51240 outils",
  stats.json?.stats?.apps === 1467 && stats.json?.stats?.tools === 51240,
  `apps=${stats.json?.stats?.apps} outils=${stats.json?.stats?.tools} catégories=${stats.json?.stats?.categories?.length}`
)

// 2. Catalogue : recherche
const search = await call("GET", "/api/connectors/catalog?search=slack&pageSize=6")
const slackFound = search.json?.apps?.some((a) => a.slug === "slack")
check(
  "GET catalogue recherche « slack »",
  search.json?.ok === true && search.json?.total > 0 && slackFound,
  `${search.json?.total} résultats, slack présent=${slackFound}`
)

// 3. Catalogue : pagination
const page2 = await call("GET", "/api/connectors/catalog?page=2&pageSize=24")
check(
  "GET catalogue page 2",
  page2.json?.ok === true && page2.json?.apps?.length === 24 && page2.json?.page === 2,
  `${page2.json?.apps?.length} apps, total=${page2.json?.total?.toLocaleString?.("fr-FR")}`
)

// 4. Catalogue : détail d'une app avec outils
const github = await call("GET", "/api/connectors/catalog/github")
check(
  "GET catalogue/github — détail + outils",
  github.json?.ok === true && github.json?.toolsTotal > 50 && Array.isArray(github.json?.tools),
  `${github.json?.app?.name} : ${github.json?.toolsTotal} outils, connectable=${github.json?.connectivity?.connectable}`
)

// 5. Mode live : création de session
const live = await call("POST", "/api/live", { title: "E2E v3.4 — vérification" })
const liveCode = live.json?.session?.code
check(
  "POST /api/live — session créée",
  live.json?.ok === true && !!liveCode,
  `code=${liveCode}${live.json?.alreadyLive ? " (session déjà active réutilisée)" : ""}`
)

// 6. Mode live : informations de session
if (liveCode) {
  const info = await call("GET", `/api/live/${liveCode}`)
  check(
    "GET /api/live/[code] — session lisible",
    info.json?.ok === true && info.json?.session?.status === "LIVE",
    `hôte=${info.json?.session?.host?.name}, spectateurs=${info.json?.session?.viewerCount}`
  )

  // 7. Signalisation : lecture (long-poll borné)
  const started = Date.now()
  const signals = await call("GET", `/api/live/${liveCode}/signal`)
  const elapsed = Date.now() - started
  check(
    "GET /api/live/[code]/signal — long-poll fonctionnel",
    signals.json?.ok === true && Array.isArray(signals.json?.signals) && elapsed > 3000,
    `${signals.json?.signals?.length ?? 0} signal(aux), réponse en ${elapsed}ms`
  )

  // 8. Fin de session
  const end = await call("DELETE", `/api/live/${liveCode}`)
  check("DELETE /api/live/[code] — session terminée", end.json?.ok === true && end.json?.ended === true)
}

// 9. OAuth login : garde-fou propre (non configuré → 503, pas de crash)
const oauth = await fetch(`${BASE}/api/auth/oauth/github`, { redirect: "manual" })
check(
  "GET /api/auth/oauth/github — 503 propre (identifiants absents)",
  oauth.status === 503,
  `HTTP ${oauth.status}`
)
const oauthGoogle = await fetch(`${BASE}/api/auth/oauth/google`, { redirect: "manual" })
check(
  "GET /api/auth/oauth/google — 503 propre (identifiants absents)",
  oauthGoogle.status === 503,
  `HTTP ${oauthGoogle.status}`
)

// 10. Pages UI v3.4 déployées
for (const page of ["/swarm", "/batch", "/webhooks", "/watchdog", "/traces", "/finetune", "/live", "/connectors"]) {
  const res = await fetch(`${BASE}${page}`, { redirect: "manual" })
  check(`GET ${page} — page déployée`, res.status === 200, `HTTP ${res.status}`)
}

// 11. Dark mode : la classe dark est présente sur <html>
const loginPage = await fetch(`${BASE}/login`)
const html = await loginPage.text()
check(
  "GET /login — thème dark global (texte blanc)",
  html.includes('class="dark"') || html.includes("class=\"dark"),
  "classe dark sur <html>"
)

console.log(`\n=== ${failures === 0 ? "✅ v3.4 PRODUCTION VALIDÉE" : `❌ ${failures} échec(s)`} ===\n`)
process.exit(failures === 0 ? 0 : 1)
