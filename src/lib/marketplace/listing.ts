import { db } from "@/lib/db"
import { logger } from "@/lib/observability/logger"

/**
 * AgentListing — Système de listing et vente d'agents sur la marketplace.
 * Commission configurable, suivi des revenus, gestion des achats.
 */

/**
 * Crée un listing pour vendre un agent.
 */
export async function createListing(params: {
  agentId: string
  price: number
  currency?: string
  commission?: number
  description?: string
  tags?: string[]
}): Promise<string> {
  const listing = await db.agentListing.create({
    data: {
      agentId: params.agentId,
      price: params.price,
      currency: params.currency ?? "XOF",
      commission: params.commission ?? 0.1,
      description: params.description,
      tags: params.tags ? JSON.stringify(params.tags) : null,
    },
  })
  logger.info("Listing créé", { listingId: listing.id, agentId: params.agentId, price: params.price })
  return listing.id
}

/**
 * Calcule la commission et le payout pour un achat.
 */
export function calculateCommission(price: number, commissionRate: number): { commission: number; payout: number } {
  const commission = price * commissionRate
  return { commission, payout: price - commission }
}

/**
 * Traite l'achat d'un agent.
 */
export async function purchaseAgent(buyerId: string, listingId: string): Promise<{ purchaseId: string; success: boolean; error?: string }> {
  const listing = await db.agentListing.findUnique({ where: { id: listingId } })
  if (!listing) return { purchaseId: "", success: false, error: "Listing introuvable" }

  const agent = await db.agent.findUnique({ where: { id: listing.agentId } })
  if (!agent) return { purchaseId: "", success: false, error: "Agent introuvable" }

  const { commission, payout } = calculateCommission(listing.price, listing.commission)

  const purchase = await db.purchase.create({
    data: {
      buyerId,
      sellerId: agent.userId,
      agentId: agent.id,
      listingId,
      amount: listing.price,
      commission,
      payout,
      status: "COMPLETED",
    },
  })

  // Mettre à jour les compteurs du listing
  await db.agentListing.update({
    where: { id: listingId },
    data: {
      purchases: { increment: 1 },
      revenue: { increment: listing.price },
    },
  })

  // Fork l'agent pour l'acheteur
  const forkedAgent = await db.agent.create({
    data: {
      userId: buyerId,
      name: `${agent.name} (fork)`,
      slug: `${agent.slug}-fork-${Date.now()}`,
      description: agent.description,
      systemPrompt: agent.systemPrompt,
      provider: agent.provider,
      model: agent.model,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      status: "PUBLISHED",
      visibility: "PRIVATE",
      config: agent.config,
    },
  })

  logger.info("Achat agent", { purchaseId: purchase.id, buyerId, agentId: agent.id, forkId: forkedAgent.id })
  return { purchaseId: purchase.id, success: true }
}

/**
 * Récupère les listings de la marketplace.
 */
export async function getListings(limit = 20, offset = 0) {
  const listings = await db.agentListing.findMany({
    skip: offset,
    take: limit,
    orderBy: { purchases: "desc" },
    include: { agent: true },
  })
  return listings
}
