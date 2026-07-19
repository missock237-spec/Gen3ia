import { NextRequest, NextResponse } from "next/server";
import { PLANS } from "@/lib/sebpay";

export async function GET() {
  return NextResponse.json({
    subscription: {
      id: "sub_sebpay_free",
      plan: "free",
      status: "active",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    },
    currentPlan: PLANS.find(p => p.id === "free"),
  });
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { planId } = body;
    const plan = PLANS.find(p => p.id === planId);
    if (!plan) {
      return NextResponse.json({ error: "Plan invalide" }, { status: 400 });
    }
    return NextResponse.json({ message: `Redirection vers SebPay pour ${plan.name}`, plan });
  } catch (err) {
    return NextResponse.json({ error: "Erreur de mise à jour" }, { status: 500 });
  }
}

export async function DELETE() {
  return NextResponse.json({ message: "Abonnement résilié" });
}
