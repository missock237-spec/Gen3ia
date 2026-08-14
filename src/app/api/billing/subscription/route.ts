// GET/PUT/DELETE /api/billing/subscription
// SECURITE: withAuth() — gestion d'abonnement, acces utilisateur authentifie
import { NextRequest, NextResponse } from "next/server";
import { PLANS } from "@/lib/sebpay";
import { withAuth, type RouteParams } from "@/lib/with-auth";





export const dynamic = "force-dynamic";
export const GET = withAuth(async () => {
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
}, {
  requireAuth: true,
  roles: ['user'],
  rateLimit: { limit: 20, windowMs: 60000 },
});

export const PUT = withAuth(async (request: NextRequest, ctx: { params?: RouteParams }, auth) => {
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
}, {
  requireAuth: true,
  roles: ['user'],
  rateLimit: { limit: 5, windowMs: 60000 }, // changement de plan : quelques fois/min
});

export const DELETE = withAuth(async () => {
  return NextResponse.json({ message: "Abonnement résilié" });
}, {
  requireAuth: true,
  roles: ['user'],
  rateLimit: { limit: 5, windowMs: 60000 },
});
