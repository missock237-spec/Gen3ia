// ============================================================
// POST /api/payments/subscribe — S'abonner via SebPay
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { sebpay, SUBSCRIPTION_PLANS } from "@/lib/sebpay";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";





export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { planId, phone, operator, userId } = body;

    if (!planId || !phone || !operator || !userId) {
      return NextResponse.json({ error: "Champs requis : planId, phone, operator, userId" }, { status: 400 });
    }

    const plan = SUBSCRIPTION_PLANS.find((p) => p.id === planId);
    if (!plan) return NextResponse.json({ error: `Plan "${planId}" introuvable` }, { status: 404 });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });

    const reference = `sub_${planId}_${userId}_${Date.now()}`;

    const payment = await sebpay.initiatePayment({
      amount: plan.price,
      currency: "XAF",
      phone,
      operator,
      description: `Abonnement ${plan.name} - Genova AI`,
      reference,
      callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/payments/webhook`,
    });

    if (!payment.success) {
      return NextResponse.json({ error: payment.message ?? "Échec du paiement" }, { status: 502 });
    }

    logger.info("subscription_payment_initiated", { userId, planId, transactionId: payment.transactionId });

    return NextResponse.json({
      success: true,
      transactionId: payment.transactionId,
      paymentUrl: payment.paymentUrl,
      message: `Paiement initié. Vous recevrez une demande de paiement sur votre téléphone ${operator}.`,
    });
  } catch (error) {
    logger.error("subscription_payment_error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
  }
}