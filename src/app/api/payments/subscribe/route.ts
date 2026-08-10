// ============================================================
// POST /api/payments/subscribe — S'abonner via Chariow
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { chariow } from "@/lib/payment/chariow";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { SUBSCRIPTION_PLANS } from "@/lib/sebpay";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { planId, phone, userId } = body;

    if (!planId || !userId) {
      return NextResponse.json({ error: "Champs requis : planId, userId" }, { status: 400 });
    }

    const plan = SUBSCRIPTION_PLANS.find((p) => p.id === planId);
    if (!plan) return NextResponse.json({ error: `Plan "${planId}" introuvable` }, { status: 404 });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });

    if (!chariow.isConfigured()) {
      return NextResponse.json({ error: "Chariow non configuré" }, { status: 503 });
    }

    const productId = process.env[`CHARIOW_PRODUCT_PLAN_${planId.toUpperCase()}`] || '';
    if (!productId) return NextResponse.json({ error: `Produit Chariow non configuré pour ${planId}` }, { status: 503 });

    const reference = `sub_${planId}_${userId}_${Date.now()}`;

    const checkout = await chariow.initiateCheckout({
      productId,
      customerEmail: user.email,
      customerName: user.name || undefined,
      metadata: { userId, type: 'plan', planId, credits: String(plan.credits) },
      successUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/billing?success=1&ref=${reference}`,
      cancelUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/billing`,
    });

    logger.info("subscription_payment_initiated", { userId, planId, saleId: checkout.saleId });

    return NextResponse.json({
      success: true,
      transactionId: checkout.saleId || reference,
      paymentUrl: checkout.checkoutUrl,
      message: checkout.step === 'payment'
        ? "Paiement initié. Vous serez redirigé vers Chariow pour finaliser votre achat."
        : "Votre abonnement a été activé.",
    });
  } catch (error) {
    logger.error("subscription_payment_error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
  }
}