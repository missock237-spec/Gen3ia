import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { handleRoute, readJson, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { createChariowCheckout, findOffer, chariowConfigured } from "@/lib/payments/chariow"
import { getAppUrl } from "@/lib/config"
import { audit } from "@/lib/engines/audit"

const checkoutSchema = z.object({ planKey: z.enum(["starter", "pro", "business"]) })

/** Initialise un paiement Chariow pour une recharge de crédits. */
export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const body = await readJson(req, checkoutSchema)

    const offer = findOffer(body.planKey)
    if (!offer) throw new ApiError(400, "Offre inconnue.", "BAD_PLAN")
    if (!chariowConfigured()) {
      throw new ApiError(
        503,
        "Paiements non activés : la clé CHARIOW_API_KEY n'est pas configurée sur ce serveur.",
        "CHARIOW_NOT_CONFIGURED"
      )
    }

    const appUrl = getAppUrl()
    const checkout = await createChariowCheckout({
      amount: offer.price,
      currency: offer.currency,
      customerEmail: user.email,
      description: `GEN3IA — Pack ${offer.name} (${offer.credits} crédits)`,
      callbackUrl: `${appUrl}/billing?payment=pending`,
      metadata: { userId: user.id, planKey: offer.key, credits: offer.credits },
    })

    const payment = await db.payment.create({
      data: {
        userId: user.id,
        provider: "chariow",
        checkoutId: checkout.checkoutId,
        plan: offer.key,
        amount: offer.price,
        currency: offer.currency,
        credits: offer.credits,
        status: "PENDING",
      },
    })
    await audit(req, {
      userId: user.id, action: "CHECKOUT_CREATED", entityType: "payment", entityId: payment.id,
      detail: { plan: offer.key, amount: offer.price },
    })

    return Response.json({ ok: true, paymentUrl: checkout.paymentUrl, paymentId: payment.id })
  })
}
