import { NextRequest, NextResponse } from "next/server";
import { initiatePayment, PLANS } from "@/lib/sebpay";

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

    const reference = `GENOVA-${planId}-${Date.now()}`;
    const payment = await initiatePayment({
      amount: plan.price,
      currency: "XAF",
      description: `Abonnement ${plan.name} - Genova AI`,
      reference,
      callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/billing/webhook`,
      redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/billing?success=1`,
      customerEmail,
      customerName,
    });

    return NextResponse.json({ payment, plan, reference });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur paiement" },
      { status: 500 }
    );
  }
}
