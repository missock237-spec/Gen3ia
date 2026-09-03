import { NextRequest } from "next/server"
import { handleRoute } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { getTransactions } from "@/lib/credits/ledger"
import { db } from "@/lib/db"
import { PLAN_OFFERS, chariowConfigured, creditPricingInfo } from "@/lib/payments/chariow"

export async function GET(req: NextRequest) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const transactions = await getTransactions(user.id, 100)
    const payments = await db.payment.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    })
    return Response.json({
      ok: true,
      balance: user.credits,
      plan: user.plan,
      offers: PLAN_OFFERS,
      chariow: { configured: chariowConfigured() },
      /** v3.5 — vente de crédits à la carte (minimum 50) : tarification UI. */
      creditPricing: creditPricingInfo(),
      transactions,
      payments,
    })
  })
}
