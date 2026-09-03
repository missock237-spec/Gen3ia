import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { handleRoute, readJson, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import {
  createChariowCheckout,
  findOffer,
  chariowConfigured,
  priceForCredits,
  MIN_CREDITS_PURCHASE,
} from "@/lib/payments/chariow"
import { getAppUrl } from "@/lib/config"
import { audit } from "@/lib/engines/audit"

/**
 * Deux modes d'achat (v3.5) :
 *  - { planKey } : pack fixe (starter | pro | business) ;
 *  - { credits } : vente de crédits à la carte — 50 crédits MINIMUM,
 *    prix calculé par paliers dégressifs (XOF).
 * Chariow est l'UNIQUE processeur de paiement (ADR-0007).
 */
const checkoutSchema = z
  .object({
    planKey: z.enum(["starter", "pro", "business"]).optional(),
    credits: z.number().int().optional(),
  })
  .refine((b) => Boolean(b.planKey) !== Boolean(b.credits && b.credits > 0), {
    message: "Fournissez soit planKey, soit credits (pas les deux).",
  })

/** Initialise un paiement Chariow pour une recharge de crédits. */
export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const body = await readJson(req, checkoutSchema)

    let amount: number
    let currency = "XOF"
    let description: string
    let planKey: string
    let credits: number

    if (body.planKey) {
      const offer = findOffer(body.planKey)
      if (!offer) throw new ApiError(400, "Offre inconnue.", "BAD_PLAN")
      amount = offer.price
      currency = offer.currency
      planKey = offer.key
      credits = offer.credits
      description = `GEN3IA — Pack ${offer.name} (${offer.credits} crédits)`
    } else {
      // Vente de crédits à la carte : minimum 50 crédits exigé.
      const requested = body.credits ?? 0
      const price = priceForCredits(requested)
      if (price === null) {
        throw new ApiError(
          400,
          `Achat de crédits : ${MIN_CREDITS_PURCHASE} crédits minimum (montant entier positif demandé).`,
          "CREDITS_MIN_50"
        )
      }
      amount = price
      planKey = "credits"
      credits = requested
      description = `GEN3IA — Achat de ${requested} crédits`
    }

    if (!chariowConfigured()) {
      throw new ApiError(
        503,
        "Paiements non activés : la clé CHARIOW_API_KEY n'est pas configurée sur ce serveur.",
        "CHARIOW_NOT_CONFIGURED"
      )
    }

    const appUrl = getAppUrl()

    const checkout = await createChariowCheckout({
      amount,
      currency,
      customerEmail: user.email,
      description,
      callbackUrl: `${appUrl}/billing?payment=pending`,
      metadata: { userId: user.id, planKey, credits },
    })

    const payment = await db.payment.create({
      data: {
        userId: user.id,
        provider: "chariow",
        checkoutId: checkout.checkoutId,
        plan: planKey,
        amount,
        currency,
        credits,
        status: "PENDING",
      },
    })
    await audit(req, {
      userId: user.id, action: "CHECKOUT_CREATED", entityType: "payment", entityId: payment.id,
      detail: { plan: planKey, amount, credits, method: "chariow" },
    })

    return Response.json({ ok: true, paymentUrl: checkout.paymentUrl, paymentId: payment.id, method: "chariow" })
  })
}
