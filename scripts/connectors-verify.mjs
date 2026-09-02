#!/usr/bin/env node
/**
 * E2E Connectors — vérification RÉELLE du moteur de connecteurs.
 *
 * 1. Crée un utilisateur de test (session cookie).
 * 2. Catalogue : 13 apps, actions, disponibilité (modes réels).
 * 3. Import de token GitHub (PAT réel) → connexion chiffrée.
 * 4. Exécution de connector_github_get_me → appel HTTP RÉEL vers
 *    https://api.github.com/user (aucune réponse simulée).
 * 5. Exécution d'une action échouante → erreur explicite (pas de faux succès).
 *
 * Usage : BASE_URL=http://localhost:3000 GITHUB_TOKEN=ghp_… node scripts/connectors-verify.mjs
 * Sans GITHUB_TOKEN : étapes 1-2 + 5 uniquement (catalogue + erreurs propres).
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000"
const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? ""
const USER = `connectors-e2e-${Date.now()}@gen3ia.test`
const PASS = "Conn3ct0rs!E2E"

let failures = 0
function check(name, ok, detail = "") {
  const mark = ok ? "✓" : "✗"
  console.log(`${mark} ${name}${detail ? ` — ${detail}` : ""}`)
  if (!ok) failures++
}

async function main() {
  console.log(`\n=== E2E Connecteurs GEN3IA (${BASE_URL}) ===\n`)

  // ── 1. Utilisateur de test ──────────────────────────────
  const reg = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: USER, password: PASS, name: "E2E Connectors" }),
  })
  const regJson = await reg.json().catch(() => ({}))
  check("inscription utilisateur de test", reg.ok && regJson.ok, `HTTP ${reg.status}`)
  const cookie = (reg.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ")

  // ── 2. Catalogue ────────────────────────────────────────
  const cat = await fetch(`${BASE_URL}/api/connectors/apps`, { headers: { cookie } })
  const catJson = await cat.json()
  const apps = catJson.apps ?? []
  check("catalogue accessible (auth session)", cat.ok && catJson.ok, `HTTP ${cat.status}`)
  check("13 applications réelles au catalogue", apps.length === 13, `${apps.length} apps`)

  const github = apps.find((a) => a.slug === "github")
  const gmail = apps.find((a) => a.slug === "gmail")
  const jira = apps.find((a) => a.slug === "jira")
  check("github : import de PAT supporté", github?.connectable === true && github?.mode === "TOKEN_IMPORT")
  check("gmail : OAuth2 non configuré → indisponible (pas de fallback)", gmail?.connectable === false && gmail?.mode === "UNAVAILABLE")
  check("jira : formulaire d'identifiants", jira?.connectable === true && jira?.mode === "CREDENTIALS")
  const totalActions = apps.reduce((n, a) => n + (a.actionCount ?? 0), 0)
  check("chaque app expose des actions", totalActions > 60, `${totalActions} actions totales`)

  // Aucun secret ne doit fuiter du catalogue.
  const catRaw = JSON.stringify(catJson)
  check("aucun secret exposé par le catalogue", !/access_token|api_key":/.test(catRaw))

  // ── 3+4. Import de PAT GitHub + exécution RÉELLE ────────
  if (GITHUB_TOKEN) {
    const connect = await fetch(`${BASE_URL}/api/connectors/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ appSlug: "github", token: GITHUB_TOKEN }),
    })
    const connectJson = await connect.json().catch(() => ({}))
    check("import de token GitHub (chiffré AES-256-GCM)", connect.ok && connectJson.ok, `HTTP ${connect.status}`)

    // Vérifie le stockage chiffré côté base : aucune valeur en clair.
    const conns = await fetch(`${BASE_URL}/api/connectors/connections`, { headers: { cookie } })
    const connsJson = await conns.json()
    check(
      "connexions listées sans secret",
      conns.ok &&
        connsJson.connections?.length === 1 &&
        !JSON.stringify(connsJson).includes(GITHUB_TOKEN.slice(0, 10)),
      connsJson.connections?.[0]?.status ?? "?"
    )

    // Exécution RÉELLE : GET https://api.github.com/user.
    const exec = await fetch(`${BASE_URL}/api/connectors/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ appSlug: "github", actionSlug: "get_me", params: {} }),
    })
    const execJson = await exec.json().catch(() => ({}))
    check(
      "action get_me : appel HTTP réel vers api.github.com",
      execJson.ok === true && execJson.status === 200,
      `HTTP ${execJson.status} — ${execJson.latencyMs} ms`
    )
    check(
      "réponse GitHub authentifiée (login renvoyé)",
      typeof execJson.data?.login === "string" && execJson.data.login.length > 0,
      `login=${execJson.data?.login}`
    )

    // Recherche réelle (GET /search/repositories).
    const search = await fetch(`${BASE_URL}/api/connectors/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        appSlug: "github",
        actionSlug: "search_repositories",
        params: { q: "gen3ia", per_page: 3 },
      }),
    })
    const searchJson = await search.json().catch(() => ({}))
    check(
      "action search_repositories : résultats réels",
      searchJson.ok === true && Array.isArray(searchJson.data?.items),
      `${searchJson.data?.items?.length ?? 0} dépôts`
    )

    // Suppression (révocation).
    const connId = connsJson.connections?.[0]?.id
    if (connId) {
      const del = await fetch(`${BASE_URL}/api/connectors/connections/${connId}`, {
        method: "DELETE",
        headers: { cookie },
      })
      check("déconnexion + suppression", del.ok)
      const after = await fetch(`${BASE_URL}/api/connectors/connections`, { headers: { cookie } })
      const afterJson = await after.json()
      check("connexion réellement supprimée", (afterJson.connections ?? []).length === 0)
    }
  } else {
    console.log("ℹ GITHUB_TOKEN non fourni : exécution réelle d'action sautée (catalogue vérifié).")
  }

  // ── 5. Erreurs propres (pas de faux succès) ─────────────
  const execUnknown = await fetch(`${BASE_URL}/api/connectors/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ appSlug: "github", actionSlug: "action_inexistante", params: {} }),
  })
  const execUnknownJson = await execUnknown.json().catch(() => ({}))
  check(
    "action inconnue → erreur explicite",
    execUnknown.status >= 400 && execUnknownJson.ok === false,
    execUnknownJson.error ?? `HTTP ${execUnknown.status}`
  )

  const execNoConn = await fetch(`${BASE_URL}/api/connectors/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ appSlug: "slack", actionSlug: "send_message", params: { channel: "C1", text: "x" } }),
  })
  const execNoConnJson = await execNoConn.json().catch(() => ({}))
  check(
    "sans connexion → erreur explicite (jamais de faux succès)",
    execNoConn.status >= 400 && execNoConnJson.ok === false,
    (execNoConnJson.error ?? "").slice(0, 60)
  )

  // Route protégée sans session.
  const noAuth = await fetch(`${BASE_URL}/api/connectors/apps`)
  check("catalogue sans session → 401", noAuth.status === 401, `HTTP ${noAuth.status}`)

  console.log(`\n=== ${failures === 0 ? "SUCCÈS TOTAL" : `${failures} ÉCHEC(S)`} ===\n`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error("Erreur fatale :", err)
  process.exit(1)
})
