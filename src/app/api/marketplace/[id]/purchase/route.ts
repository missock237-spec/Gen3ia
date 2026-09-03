import { NextRequest } from "next/server"
import { handleRoute, ApiError } from "@/lib/api"
import { requireUser } from "@/lib/auth/guards"
import { getBalance } from "@/lib/credits/ledger"
import { purchaseAgent } from "@/lib/marketplace/listing"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireUser(req)
    const { id: listingId } = await params

    // Vérifier les crédits
    const balance = await getBalance(user.id)
    // En production : déduire les crédits selon le prix

    const result = await purchaseAgent(user.id, listingId)
    if (!result.success) throw new ApiError(400, result.error ?? "Achat échoué", "PURCHASE_FAILED")
    return Response.json({ ok: true, purchaseId: result.purchaseId })
  })
}
