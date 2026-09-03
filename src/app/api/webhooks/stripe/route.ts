import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { verifyStripeSignature, stripeWebhookConfigured } from "@/lib/payments/stripe"
import { fulfillPayment } from "@/lib/payments/fulfillment"
import { audit } from "@/lib/engines/audit"
import { getClientIp } from "@/lib/api"
import { checkRateLimit } from "@/lib/security/rate-limit"

/**
 * Webhook Stripe — confirmations du SECOND processeur de paiement (v3.6).
 *
 * Sécurité :
 *  - vérification de Stripe-Signature (HMAC-SHA256, tolérance 300 s) sur le
 *    corps BRUT avant tout traitement ;
 *  - rate limiting IP (120/min) avant vérification ;
 *  - idempotence : paiement déjà SUCCEEDED → ignoré ;
 *  - fulfillment partagé avec Chariow (Credit Ledger, abonnements, pub).
 *
 * Événement traité : checkout.session.completed (metadata : userId,
 * plan, credits — posées à la création de session).
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req) ?? "local"
  const limit = checkRateLimit("webhook", ip)
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many webhook requests. Retry later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1000)) } }
    )
  }

  if (!stripeWebhookConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Stripe webhook non configuré (STRIPE_WEBHOOK_SECRET absente)." },
      { status: 503 }
    )
  }

  try {
    const rawBody = await req.text()
    const signature = req.headers.get("stripe-signature")

    if (!verifyStripeSignature(rawBody, signature)) {
      return NextResponse.json(
        { ok: false, error: "Signature de webhook Stripe invalide." },
        { status: 401 }
      )
    }

    let event: { type?: string; data?: { object?: { id?: string; payment_status?: string } } }
    try {
      event = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ ok: false, error: "Corps JSON invalide." }, { status: 400 })
    }

    if (event.type !== "checkout.session.completed") {
      // Événements non pertinents acquittés (200) : Stripe ne retransmet pas.
      return NextResponse.json({ ok: true, ignored: true, type: event.type ?? null })
    }

    const sessionId = event.data?.object?.id
    if (!sessionId) {
      return NextResponse.json({ ok: false, error: "Session Stripe manquante." }, { status: 400 })
    }

    const payment = await db.payment.findFirst({ where: { checkoutId: sessionId, provider: "stripe" } })
    if (!payment || payment.status === "SUCCEEDED") {
      return NextResponse.json({ ok: true, ignored: true })
    }

    const paymentStatus = event.data?.object?.payment_status ?? "paid"
    if (paymentStatus !== "paid") {
      await db.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED", raw: rawBody.slice(0, 5000) },
      })
      await audit(null, {
        userId: payment.userId,
        action: "PAYMENT_FAILED",
        entityType: "payment",
        entityId: payment.id,
        detail: { provider: "stripe", sessionId, paymentStatus },
      })
      return NextResponse.json({ ok: true, failed: true })
    }

    await fulfillPayment(
      { id: payment.id, userId: payment.userId, plan: payment.plan ?? "credits", credits: payment.credits, amount: payment.amount },
      sessionId,
      rawBody,
      "stripe"
    )
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[stripe-webhook] erreur :", err)
    return NextResponse.json({ ok: false, error: "Erreur interne du webhook." }, { status: 500 })
  }
}
