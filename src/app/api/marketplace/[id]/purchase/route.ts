import { NextRequest } from "next/server"
import { handleRoute, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { purchaseAgent } from "@/lib/marketplace/listing"
import { InsufficientCreditsError } from "@/lib/credits/ledger"

/**
 * Achat d'un agent de la marketplace (v3.6) : débit RÉEL de l'acheteur,
 * payout du vendeur (80 %), commission plateforme 20 %, fork de l'agent.
 * Idempotent (re-achat = re-fork sans re-paiement). Auto-achat interdit.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const { id: listingId } = await params

    try {
      const result = await purchaseAgent(user.id, listingId)
      if (!result.success) throw new ApiError(400, result.error ?? "Achat échoué", "PURCHASE_FAILED")
      return Response.json({
        ok: true,
        purchaseId: result.purchaseId,
        forkedAgentId: result.forkedAgentId,
        charged: result.charged ?? 0,
        payout: result.payout ?? 0,
      })
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        throw new ApiError(402, err.message, "NO_CREDITS")
      }
      throw err
    }
  })
}
