import crypto from "node:crypto"
import { ApiError } from "@/lib/api"

/**
 * Stripe — SECOND processeur de paiement (v3.6 — business).
 *
 * Intégration REST native (sans dépendance npm) :
 *  - Checkout Sessions via api.stripe.com/v1/checkout/sessions (form-encoded,
 *    conformes à la spécification Stripe) ;
 *  - Webhooks : vérification manuelle de Stripe-Signature
 *    (HMAC-SHA256(secret, "t.<corps>") + tolérance temporelle 300 s) ;
 *  - devises zéro-décimale (XOF/FCFA…) gérées nativement ;
 *  - fail-closed : STRIPE_SECRET_KEY absente → erreur explicite 503, le
 *    processeur Chariow reste la voie par défaut.
 *
 * Configuration :
 *   STRIPE_SECRET_KEY            — clé secrète (sk_live_… / sk_test_…)
 *   STRIPE_WEBHOOK_SECRET        — secret du endpoint (whsec_…)
 *   APP_URL                      — URLs de succès/annulation
 */

const API_BASE = "https://api.stripe.com/v1"
const SIGNATURE_TOLERANCE_S = 300

/** Devises « zéro-décimale » selon la doc Stripe (montant = unité entière). */
const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF",
  "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
])

export function stripeConfigured(): boolean {
  const key = process.env.STRIPE_SECRET_KEY?.trim()
  return Boolean(key && key.startsWith("sk_"))
}

export function stripeWebhookConfigured(): boolean {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim().startsWith("whsec_"))
}

export interface StripeCheckoutRequest {
  amount: number
  currency: string
  customerEmail: string
  description: string
  successUrl: string
  cancelUrl: string
  /** Métadonnées retrouvées dans le webhook (userId, planKey, credits…). */
  metadata: Record<string, string | number>
}

export interface StripeCheckoutResponse {
  sessionId: string
  checkoutUrl: string
}

/**
 * Crée une session de paiement Stripe Checkout et renvoie l'URL hébergée.
 * Montant : unité monétaire ENTIÈRE pour les devises zéro-décimale (XOF),
 * sinon conversion centimes → le montant GEN3IA est toujours en FCFA.
 */
export async function createStripeCheckout(req: StripeCheckoutRequest): Promise<StripeCheckoutResponse> {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new ApiError(
      503,
      "Stripe non configuré : STRIPE_SECRET_KEY absente sur le serveur. Utilisez le paiement Chariow ou ajoutez la clé Stripe.",
      "STRIPE_NOT_CONFIGURED"
    )
  }

  const currency = req.currency.toLowerCase()
  const unitAmount = ZERO_DECIMAL_CURRENCIES.has(req.currency.toUpperCase())
    ? Math.round(req.amount)
    : Math.round(req.amount * 100)

  const form = new URLSearchParams()
  form.set("mode", "payment")
  form.set("success_url", req.successUrl)
  form.set("cancel_url", req.cancelUrl)
  form.set("customer_email", req.customerEmail)
  form.set("client_reference_id", String(req.metadata.userId))
  form.set("line_items[0][quantity]", "1")
  form.set("line_items[0][price_data][currency]", currency)
  form.set("line_items[0][price_data][unit_amount]", String(unitAmount))
  form.set("line_items[0][price_data][product_data][name]", req.description.slice(0, 200))
  for (const [k, v] of Object.entries(req.metadata)) {
    form.set(`metadata[${k}]`, String(v))
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE}/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (err) {
    throw new ApiError(
      502,
      `Stripe injoignable : ${err instanceof Error ? err.message : String(err)}`,
      "STRIPE_UNREACHABLE"
    )
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new ApiError(
      502,
      `Stripe a refusé la session : HTTP ${res.status} ${text.slice(0, 300)}`,
      "STRIPE_SESSION_FAILED"
    )
  }

  const session = (await res.json()) as { id: string; url: string }
  return { sessionId: session.id, checkoutUrl: session.url }
}

/**
 * Vérifie l'en-tête Stripe-Signature sur le corps brut du webhook :
 *   v1 = HMAC-SHA256(webhookSecret, `${timestamp}.${rawBody}`)
 * Tolérance 300 s (rejeu temporel) — comparaison à temps constant.
 */
export function verifyStripeSignature(rawBody: string, signatureHeader: string | null, nowMs = Date.now()): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret || !signatureHeader) return false

  const parts = new Map<string, string[]>()
  for (const pair of signatureHeader.split(",")) {
    const [k, v] = pair.split("=", 2)
    if (k && v) {
      if (!parts.has(k)) parts.set(k, [])
      parts.get(k)!.push(v)
    }
  }
  const timestamp = parts.get("t")?.[0]
  const signatures = parts.get("v1") ?? []
  if (!timestamp || signatures.length === 0) return false

  // Tolérance temporelle anti-rejeu.
  const age = Math.abs(Math.floor(nowMs / 1000) - Number(timestamp))
  if (!Number.isFinite(age) || age > SIGNATURE_TOLERANCE_S) return false

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex")
  const expectedBuf = Buffer.from(expected, "utf8")
  for (const candidate of signatures) {
    const candidateBuf = Buffer.from(candidate, "utf8")
    if (candidateBuf.length === expectedBuf.length && crypto.timingSafeEqual(candidateBuf, expectedBuf)) {
      return true
    }
  }
  return false
}

export { ZERO_DECIMAL_CURRENCIES }
