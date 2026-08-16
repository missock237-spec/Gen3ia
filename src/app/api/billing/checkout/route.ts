import { NextRequest, NextResponse } from "next/server";
import { chariow } from "@/lib/payment/chariow";
import { PLANS } from "@/lib/sebpay";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { planId, customerEmail, customerName } = body;

    const plan = PLANS.find(p => p.id === planId);
    if (!plan) {
      return NextResponse.json({ error: "Plan invalide" }, { status: 400 });
    }
    if (plan.price === 0) {
      return NextResponse.json({ status: "free_plan", message: "Plan gratuit activé" });
    }
    if (!chariow.isConfigured()) {
      return NextResponse.json({ error: "Chariow non configuré" }, { status: 503 });
    }

    const productId = process.env[`CHARIOW_PRODUCT_PLAN_${planId.toUpperCase()}`] || '';
    if (!productId) {
      return NextResponse.json({ error: `Produit Chariow non configuré pour ${planId}` }, { status: 503 });
    }

    const reference = `GENOVA-${planId}-${Date.now()}`;
    const checkout = await chariow.initiateCheckout({
      productId,
      customerEmail,
      customerName,
      metadata: { type: 'plan', planId, credits: String(plan.credits || 0) },
      successUrl: `${process.env.NEXT_PUBLIC_APP_URL}/billing?success=1&ref=${reference}`,
      cancelUrl: `${process.env.NEXT_PUBLIC_APP_URL}/billing`,
    });

    return NextResponse.json({
      payment: {
        success: true,
        transactionId: checkout.saleId || reference,
        paymentUrl: checkout.checkoutUrl,
        status: checkout.step === 'payment' ? 'pending' : checkout.step,
      },
      plan,
      reference,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur paiement" },
      { status: 500 }
    );
  }
}
