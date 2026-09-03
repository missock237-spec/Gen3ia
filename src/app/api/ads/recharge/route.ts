import { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { handleRoute, readJson, jsonOk, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { createChariowCheckout, chariowConfigured } from "@/lib/payments/chariow"
import { AD_RECHARGE_MIN_FCFA, AD_RECHARGE_MAX_FCFA } from "@/lib/ads/ledger"
import { getAppUrl } from "@/lib/config"
import { audit } from "@/lib/engines/audit"

const rechargeSchema = z.object({
  /** Montant de la recharge publicitaire en FCFA (XOF). */
  amount: z.number().min(AD_RECHARGE_MIN_FCFA).max(AD_RECHARGE_MAX_FCFA),
})

/**
 * POST /api/ads/recharge — initie une recharge du portefeuille
 * publicitaire via Chariow (minimum 1 000 FCFA). La créditation est
 * effectuée par le webhook (plan « ads_recharge ») après paiement
 * confirmé — jamais côté client.
 */
export async function POST(req: NextRequest) {
  return handleRoute(req, async () => {
    const user = await requireUser(req)
    const body = await readJson(req, rechargeSchema)

    if (!chariowConfigured()) {
      throw new ApiError(
        503,
        "Paiements non activés : la clé CHARIOW_API_KEY n'est pas configurée sur ce serveur.",
        "CHARIOW_NOT_CONFIGURED"
      )
    }

    const amount = Math.round(body.amount)
    if (amount < AD_RECHARGE_MIN_FCFA) {
      throw new ApiError(
        400,
        `Recharge publicitaire : ${AD_RECHARGE_MIN_FCFA.toLocaleString("fr-FR")} FCFA minimum.`,
        "ADS_RECHARGE_MIN"
      )
    }

    const appUrl = getAppUrl()
    const checkout = await createChariowCheckout({
      amount,
      currency: "XOF",
      customerEmail: user.email,
      description: `GEN3IA Publicité — Recharge portefeuille (${amount.toLocaleString("fr-FR")} FCFA)`,
      callbackUrl: `${appUrl}/ads?payment=pending`,
      metadata: { userId: user.id, planKey: "ads_recharge", credits: 0 },
    })

    const payment = await db.payment.create({
      data: {
        userId: user.id,
        provider: "chariow",
        checkoutId: checkout.checkoutId,
        plan: "ads_recharge",
        amount,
        currency: "XOF",
        credits: 0,
        status: "PENDING",
      },
    })
    await audit(req, {
      userId: user.id,
      action: "ADS_RECHARGE_CREATED",
      entityType: "payment",
      entityId: payment.id,
      detail: { amount },
    })

    return jsonOk({ paymentUrl: checkout.paymentUrl, paymentId: payment.id })
  })
}
