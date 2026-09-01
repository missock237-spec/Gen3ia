import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { verifyChariowSignature } from "@/lib/payments/chariow"
import { grantCredits } from "@/lib/credits/ledger"
import { audit } from "@/lib/engines/audit"

/**
 * Webhook Chariow — UNIQUE point d'entrée des confirmations de paiement.
 * Sécurité : la signature HMAC-SHA256 (x-chariow-signature) est vérifiée
 * sur le corps BRUT avant tout traitement. Un paiement réussi crédite le
 * compte via le Credit Ledger (jamais de modification directe du solde).
 */

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()
    const signature = req.headers.get("x-chariow-signature")

    if (!verifyChariowSignature(rawBody, signature)) {
      return NextResponse.json(
        { ok: false, error: "Signature de webhook invalide ou secret non configuré." },
        { status: 401 }
      )
    }

     
    let event: any
    try {
      event = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ ok: false, error: "Corps JSON invalide." }, { status: 400 })
    }

    // Compatibilité : { event, data } ou payload direct.
     
    const data: any = event?.data ?? event ?? {}
    const status: string = String(
      data?.status ?? event?.status ?? event?.event_type ?? ""
    ).toLowerCase()
    const checkoutId: string | undefined =
      data?.id ?? data?.checkout_id ?? data?.transaction_id ?? event?.id

    if (!checkoutId) {
      return NextResponse.json({ ok: false, error: "Identifiant de paiement manquant." }, { status: 400 })
    }

    const payment = await db.payment.findFirst({
      where: { checkoutId, provider: "chariow" },
    })

    // Idempotence : un paiement déjà traité n'est pas re-crédité.
    if (!payment || payment.status === "SUCCEEDED") {
      return NextResponse.json({ ok: true, ignored: true })
    }

    const isSuccess =
      status.includes("succe") || status === "paid" || status === "completed" || status === "payment.succeeded"

    if (isSuccess) {
      await db.$transaction([
        db.payment.update({
          where: { id: payment.id },
          data: { status: "SUCCEEDED", raw: rawBody.slice(0, 5000) },
        }),
        db.user.update({
          where: { id: payment.userId },
          data: { plan: payment.plan === "business" ? "ENTERPRISE" : "PRO" },
        }),
      ])
      await grantCredits(payment.userId, payment.credits, {
        type: "TOPUP",
        description: `Recharge Chariow — pack ${payment.plan ?? "custom"} (${payment.credits} crédits)`,
        refType: "payment",
        refId: payment.id,
      })
      await audit(null, {
        userId: payment.userId,
        action: "PAYMENT_SUCCEEDED",
        entityType: "payment",
        entityId: payment.id,
        detail: { credits: payment.credits, checkoutId },
      })
    } else if (status.includes("fail") || status.includes("cancel") || status.includes("expire")) {
      await db.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED", raw: rawBody.slice(0, 5000) },
      })
      await audit(null, {
        userId: payment.userId,
        action: "PAYMENT_FAILED",
        entityType: "payment",
        entityId: payment.id,
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[chariow-webhook] erreur :", err)
    return NextResponse.json({ ok: false, error: "Erreur interne du webhook." }, { status: 500 })
  }
}
