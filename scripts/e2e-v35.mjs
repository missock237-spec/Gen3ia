/**
 * Vérification E2E v3.5 en production : mot de passe exigeant, vente de
 * crédits (minimum 50), page Publicités (portefeuille, campagnes, comptes
 * publicitaires), copilote IA live (garde-fous), i18n (langue FR par défaut).
 */
const BASE = process.env.BASE_URL ?? "https://gen3ia.online"
const rnd = Date.now()
const email = `v35_${rnd}@gen3ia.test`
const password = "E2eSecure!4567"
const weakPassword = "court123"

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

console.log(`\n=== Vérification v3.5 PRODUCTION sur ${BASE} ===\n`)

// 1. Politique de mot de passe : faible refusée, forte acceptée
const weakReg = await call("POST", "/api/auth/register", {
  name: "E2E v3.5",
  email: `v35w_${rnd}@gen3ia.test`,
  password: weakPassword,
})
check(
  "register mot de passe faible (8 car. sans spécial) → refusé",
  weakReg.status === 400,
  `status=${weakReg.status}`
)

const reg = await call("POST", "/api/auth/register", { name: "E2E v3.5", email, password })
check(
  "register mot de passe conforme (12+ car., maj, min, spécial) → accepté",
  reg.status === 200 && reg.json?.ok === true,
  `crédits=${reg.json?.user?.credits}`
)

// 2. Page Publicités : HTML servi + API authentifiée
const adsPage = await fetch(`${BASE}/ads`, { redirect: "manual" })
check("GET /ads → 200 (page Publicités déployée)", adsPage.status === 200, `status=${adsPage.status}`)

// Sans session : fetch brut sans cookie (les appels authentifiés suivants
// réutilisent la session — ici on la contourne volontairement).
const adsNoAuth = await fetch(`${BASE}/api/ads`, { headers: { "Content-Type": "application/json" } })
check("GET /api/ads sans session → 401", adsNoAuth.status === 401, `status=${adsNoAuth.status}`)

const ads = await call("GET", "/api/ads")
const adsOk =
  ads.json?.ok === true &&
  typeof ads.json?.balance === "number" &&
  Array.isArray(ads.json?.campaigns) &&
  Array.isArray(ads.json?.accounts) &&
  ads.json?.accounts?.length >= 4
check(
  "GET /api/ads — portefeuille + campagnes + comptes publicitaires",
  adsOk,
  `solde=${ads.json?.balance} FCFA, campagnes=${ads.json?.campaigns?.length}, comptes=${ads.json?.accounts?.length} (${ads.json?.accounts?.map((a) => a.slug).join(", ")})`
)
const hasAllPlatforms = ["googleads", "metaads", "tiktok", "linkedin_ads"].every((slug) =>
  ads.json?.accounts?.some((a) => a.slug === slug)
)
check("comptes Google Ads, Meta Ads, TikTok Ads, LinkedIn Ads présents", hasAllPlatforms)

// 3. Campagne publicitaire : création + activation refusée sans budget
const campaign = await call("POST", "/api/ads", {
  name: "Campagne E2E v3.5",
  platform: "googleads",
  objective: "TRAFFIC",
  budgetPerDay: 0,
})
const campaignId = campaign.json?.campaign?.id
check(
  "POST /api/ads — campagne créée en brouillon",
  campaign.json?.ok === true && campaignId && campaign.json?.campaign?.status === "DRAFT",
  `id=${campaignId ? campaignId.slice(0, 8) : "?"}`
)

const activateNoBudget = await call("PATCH", `/api/ads/campaigns/${campaignId}`, { status: "ACTIVE" })
check(
  "activation sans budget → refusée (400 AD_NO_BUDGET)",
  activateNoBudget.status === 400,
  `status=${activateNoBudget.status}`
)

const delCampaign = await call("DELETE", `/api/ads/campaigns/${campaignId}`)
check("DELETE campagne → supprimée", delCampaign.json?.ok === true)

// 4. Vente de crédits : minimum 50 appliqué
const billing = await call("GET", "/api/billing")
const pricingOk =
  billing.json?.creditPricing?.min === 50 && Array.isArray(billing.json?.creditPricing?.tiers)
check(
  "GET /api/billing — tarification crédits exposée (min 50)",
  pricingOk,
  `min=${billing.json?.creditPricing?.min}, paliers=${billing.json?.creditPricing?.tiers?.length}`
)

const lowCredits = await call("POST", "/api/billing/checkout", { credits: 30 })
check(
  "achat 30 crédits → refusé (400, minimum 50)",
  lowCredits.status === 400,
  `status=${lowCredits.status}`
)

const minCredits = await call("POST", "/api/billing/checkout", { credits: 50 })
// 50 crédits valides : checkout créé (200), Chariow non configuré (503)
// ou fournisseur externe injoignable (502) — tous trois prouvent que la
// validation du minimum a PASSÉ (les 30 crédits ont été rejetés avant).
check(
  "achat 50 crédits → validation passée (200 checkout, 503 non configuré ou 502 fournisseur injoignable)",
  [200, 503, 502].includes(minCredits.status),
  `status=${minCredits.status} ${minCredits.json?.error?.slice(0, 60) ?? ""}`
)

// 5. Recharge publicitaire : minimum 1000 FCFA appliqué
const lowRecharge = await call("POST", "/api/ads/recharge", { amount: 500 })
check(
  "recharge pub 500 FCFA → refusée (400, minimum 1000)",
  lowRecharge.status === 400,
  `status=${lowRecharge.status}`
)

// 6. Copilote IA live : garde-fous sans session valide
const agentNoSession = await call("POST", "/api/live/ZZZZ-9999/agent", {
  mode: "observe",
  image: "data:image/jpeg;base64,AAAA",
})
check(
  "POST /api/live/[code]/agent (session inexistante) → 404, pas d'erreur 500",
  agentNoSession.status === 404,
  `status=${agentNoSession.status}`
)

// 7. Créas publicitaires : CRUD
const c2 = await call("POST", "/api/ads", {
  name: "Campagne créas v3.5",
  platform: "metaads",
  objective: "CONVERSION",
  budgetPerDay: 1500,
})
const c2id = c2.json?.campaign?.id
const creative = await call("POST", "/api/ads/creatives", {
  campaignId: c2id,
  headline: "Lancement GEN3IA",
  body: "Les agents IA qui exécutent vraiment vos tâches.",
  cta: "Essayer",
})
const creativeId = creative.json?.creative?.id
check(
  "POST /api/ads/creatives — création d'annonce stockée",
  creative.json?.ok === true && creativeId && creative.json?.creative?.status === "PENDING",
  `headline=${creative.json?.creative?.headline}`
)

const adsAfter = await call("GET", "/api/ads")
const creativeVisible = adsAfter.json?.campaigns?.find((c) => c.id === c2id)?.creatives?.some((cr) => cr.id === creativeId)
check("créa visible dans la campagne (conservation des annonces)", Boolean(creativeVisible))

const delCreative = await call("DELETE", `/api/ads/creatives/${creativeId}`)
check("DELETE créa → supprimée", delCreative.json?.ok === true)
await call("DELETE", `/api/ads/campaigns/${c2id}`)

// 8. i18n : SSR statique en français + sélecteur de langue présent (le
//    changement FR/EN est résolu côté client après hydratation).
const loginHtml = await (await fetch(`${BASE}/login`)).text()
check(
  "page login rendue en français (i18n par défaut)",
  loginHtml.includes("Connexion à GEN3IA") && loginHtml.includes("ou continuer avec"),
  ""
)
check(
  "sélecteur de langue FR/EN présent sur login (aria-label)",
  loginHtml.includes("Language / Langue"),
  ""
)
const registerHtml = await (await fetch(`${BASE}/register`)).text()
check(
  "page register : aide mot de passe 12 caractères + sélecteur de langue",
  registerHtml.includes("12 caract") && registerHtml.includes("Language / Langue"),
  ""
)

// 9. Pages v3.5 toutes déployées
for (const p of ["/ads", "/billing", "/connectors", "/live", "/settings"]) {
  const res = await fetch(`${BASE}${p}`, { redirect: "manual" })
  check(`GET ${p} → 200`, res.status === 200, `status=${res.status}`)
}

console.log(`\n=== ${failures === 0 ? "SUCCÈS TOTAL" : "ÉCHECS"} : ${failures} échec(s) ===\n`)
process.exit(failures === 0 ? 0 : 1)
