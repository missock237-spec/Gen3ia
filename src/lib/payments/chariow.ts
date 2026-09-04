import crypto from "crypto"
import { ApiError } from "@/lib/api"

/**
 * Intégration Chariow — UNIQUE processeur de paiement autorisé.
 * (Aucun Stripe, PayPal ou autre processeur n'est implémenté, conformément
 * aux spécifications du produit.)
 *
 * Configuration :
 *   CHARIOW_API_KEY        — clé API du compte Chariow
 *   CHARIOW_BASE_URL       — point d'entrée API (défaut : https://api.chariow.io/v1)
 *   CHARIOW_WEBHOOK_SECRET — secret partagé pour vérifier la signature HMAC
 *
 * Le webhook entrant (/api/billing/webhook) vérifie la signature
 * x-chariow-signature = HMAC-SHA256(corps brut, secret) avant toute
 * écriture au Credit Ledger.
 */

const DEFAULT_BASE_URL = "https://api.chariow.io/v1"

export function chariowConfigured(): boolean {
  return Boolean(process.env.CHARIOW_API_KEY)
}

export interface CheckoutRequest {
  amount: number
  currency: string
  customerEmail: string
  description: string
  callbackUrl: string
  metadata: Record<string, string | number>
}

export interface CheckoutResponse {
  checkoutId: string
  paymentUrl: string
}

/** Crée une session de paiement Chariow et renvoie l'URL de checkout. */
export async function createChariowCheckout(
  req: CheckoutRequest
): Promise<CheckoutResponse> {
  const apiKey = process.env.CHARIOW_API_KEY
  if (!apiKey) {
    throw new ApiError(
      503,
      "Paiement indisponible : CHARIOW_API_KEY n'est pas configurée sur le serveur. Ajoutez la clé dans les variables d'environnement pour activer la monétisation.",
      "CHARIOW_NOT_CONFIGURED"
    )
  }
  const baseUrl = process.env.CHARIOW_BASE_URL ?? DEFAULT_BASE_URL

  let res: Response
  try {
    res = await fetch(`${baseUrl}/checkouts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        amount: req.amount,
        currency: req.currency,
        customer_email: req.customerEmail,
        description: req.description,
        callback_url: req.callbackUrl,
        metadata: req.metadata,
      }),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (err) {
    throw new ApiError(
      502,
      `Chariow injoignable : ${err instanceof Error ? err.message : String(err)}. Vérifiez CHARIOW_BASE_URL.`,
      "CHARIOW_UNREACHABLE"
    )
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new ApiError(
      502,
      `Chariow a refusé la requête (HTTP ${res.status}) : ${text.slice(0, 200)}`,
      "CHARIOW_ERROR"
    )
  }

   
  const body: any = await res.json().catch(() => null)
  const checkoutId: string | undefined =
    body?.id ?? body?.checkout_id ?? body?.transaction_id ?? body?.data?.id
  const paymentUrl: string | undefined =
    body?.checkout_url ?? body?.payment_url ?? body?.url ?? body?.data?.checkout_url ?? body?.data?.url
  if (!checkoutId || !paymentUrl) {
    throw new ApiError(
      502,
      "Réponse Chariow inattendue (identifiant ou URL de paiement manquant). Vérifiez la version de l'API (CHARIOW_BASE_URL).",
      "CHARIOW_BAD_RESPONSE"
    )
  }
  return { checkoutId, paymentUrl }
}

/** Vérifie la signature HMAC-SHA256 du webhook (comparaison à temps constant). */
export function verifyChariowSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.CHARIOW_WEBHOOK_SECRET
  if (!secret) return false
  if (!signature) return false
  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")
  const a = Buffer.from(expected, "utf8")
  const b = Buffer.from(signature.trim(), "utf8")
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

// ---------- Offres (forfaits) ----------

export interface PlanOffer {
  key: string
  name: string
  price: number
  currency: string
  credits: number
  features: string[]
}

export const PLAN_OFFERS: PlanOffer[] = [
  {
    key: "starter",
    name: "Starter",
    price: 2000,
    currency: "XOF",
    credits: 200,
    features: [
      "200 crédits d'exécution",
      "3 agents publiés",
      "Task Center complet",
      "API + SDK inclus",
    ],
  },
  {
    // v4.1 — palier 5000 FCFA et plus (exigence produit) : comble l'écart
    // Starter→Pro avec un crédit unitaire dégressif (5000/700 ≈ 7,1 XOF).
    key: "plus",
    name: "Plus",
    price: 5000,
    currency: "XOF",
    credits: 700,
    features: [
      "700 crédits d'exécution",
      "25 agents publiés",
      "Mode vocal + pièces jointes multimédia",
      "Marketplace (consultation avancée)",
      "Support 48 h",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    price: 10000,
    currency: "XOF",
    credits: 1500,
    features: [
      "1 500 crédits d'exécution",
      "Agents illimités",
      "Marketplace (publication)",
      "Mémoire longue durée renforcée",
      "Support prioritaire",
    ],
  },
  {
    key: "business",
    name: "Business",
    price: 50000,
    currency: "XOF",
    credits: 10000,
    features: [
      "10 000 crédits d'exécution",
      "Agents et déploiements illimités",
      "Auto-correction étendue (5 tentatives)",
      "Rapports d'audit exportables",
    ],
  },
]

export function findOffer(key: string): PlanOffer | undefined {
  return PLAN_OFFERS.find((p) => p.key === key)
}

// ---------- Vente de crédits à la carte (v3.5) ----------

/** Exigence produit : 50 crédits minimum par achat. */
export const MIN_CREDITS_PURCHASE = 50
/** Plafond raisonnable par transaction (anti-erreur de saisie). */
export const MAX_CREDITS_PURCHASE = 100_000

export interface CreditTier {
  min: number
  max: number
  /** Prix unitaire en XOF (FCFA). */
  unitPrice: number
}

/**
 * Paliers dégressifs de prix — cohérents avec les packs existants
 * (Starter ≈ 10 XOF/crédit, Pro ≈ 6,7, Business = 5).
 */
export const CREDIT_TIERS: CreditTier[] = [
  { min: 50, max: 499, unitPrice: 10 },
  { min: 500, max: 1499, unitPrice: 8 },
  { min: 1500, max: MAX_CREDITS_PURCHASE, unitPrice: 6 },
]

/** Prix total (XOF) pour un achat de crédits — null si montant invalide. */
export function priceForCredits(credits: number): number | null {
  if (
    !Number.isFinite(credits) ||
    !Number.isInteger(credits) ||
    credits < MIN_CREDITS_PURCHASE ||
    credits > MAX_CREDITS_PURCHASE
  ) {
    return null
  }
  const tier = CREDIT_TIERS.find((tr) => credits >= tr.min && credits <= tr.max)
  if (!tier) return null
  return credits * tier.unitPrice
}

/** Métadonnées de tarification exposées à l'UI (page facturation). */
export function creditPricingInfo(): {
  min: number
  max: number
  currency: string
  tiers: CreditTier[]
} {
  return {
    min: MIN_CREDITS_PURCHASE,
    max: MAX_CREDITS_PURCHASE,
    currency: "XOF",
    tiers: CREDIT_TIERS,
  }
}
