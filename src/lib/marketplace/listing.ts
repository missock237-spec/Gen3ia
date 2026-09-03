import { db } from "@/lib/db"
import { logger } from "@/lib/observability/logger"
import { chargeCredits, grantCredits, getBalance, InsufficientCreditsError } from "@/lib/credits/ledger"

/**
 * AgentListing — Marketplace de vente d'agents (v3.6 — business).
 *
 * VENTE RÉELLE en crédits :
 *  - l'acheteur paie le prix du listing via le Credit Ledger ;
 *  - le vendeur reçoit le PAYOUT (prix − commission) en crédits ;
 *  - la plateforme conserve la commission (défaut 20 %) ;
 *  - l'agent est forké dans le compte de l'acheteur (l'original reste
 *    la propriété du vendeur).
 * Auto-achat interdit ; listings gratuits (0 crédit) = installation libre.
 */

/** Commission de la plateforme : 20 % du prix de vente. */
export const PLATFORM_COMMISSION = 0.2

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
      commission: params.commission ?? PLATFORM_COMMISSION,
      description: params.description,
      tags: params.tags ? JSON.stringify(params.tags) : null,
    },
  })
  logger.info("Listing créé", { listingId: listing.id, agentId: params.agentId, price: params.price })
  return listing.id
}

/**
 * Calcule la commission et le payout pour un achat (20 % plateforme).
 */
export function calculateCommission(price: number, commissionRate: number = PLATFORM_COMMISSION): { commission: number; payout: number } {
  const commission = Math.round(price * commissionRate * 1000) / 1000
  return { commission, payout: Math.round((price - commission) * 1000) / 1000 }
}

export interface PurchaseResult {
  purchaseId: string
  success: boolean
  error?: string
  forkedAgentId?: string
  charged?: number
  payout?: number
}

/**
 * Traite l'achat d'un agent : débit réel de l'acheteur, payout réel du
 * vendeur, commission plateforme 20 %, fork de l'agent.
 */
export async function purchaseAgent(buyerId: string, listingId: string): Promise<PurchaseResult> {
  const listing = await db.agentListing.findUnique({ where: { id: listingId } })
  if (!listing) return { purchaseId: "", success: false, error: "Listing introuvable" }

  const agent = await db.agent.findUnique({ where: { id: listing.agentId } })
  if (!agent) return { purchaseId: "", success: false, error: "Agent introuvable" }

  // Auto-achat interdit.
  if (agent.userId === buyerId) {
    return { purchaseId: "", success: false, error: "Vous ne pouvez pas acheter votre propre agent." }
  }

  // Déjà acheté (idempotence) : l'acheteur re-fork sans re-payer.
  const existing = await db.purchase.findFirst({
    where: { buyerId, listingId, status: "COMPLETED" },
    select: { id: true, forkedAgentId: true },
  })
  if (existing) {
    return { purchaseId: existing.id, success: true, error: undefined, forkedAgentId: existing.forkedAgentId ?? undefined, charged: 0, payout: 0 }
  }

  const { commission, payout } = calculateCommission(listing.price, listing.commission)

  // 1. Débit RÉEL de l'acheteur (crédits), via le Credit Ledger.
  if (listing.price > 0) {
    const balance = await getBalance(buyerId)
    if (balance < listing.price) {
      throw new InsufficientCreditsError(listing.price, balance)
    }
    await chargeCredits(buyerId, listing.price, {
      type: "MARKETPLACE_PURCHASE",
      description: `Achat de l'agent « ${agent.name} » sur la marketplace`,
      refType: "listing",
      refId: listingId,
    })
  }

  // 2. Payout RÉEL du vendeur (prix − commission 20 %).
  if (listing.price > 0 && payout > 0) {
    await grantCredits(agent.userId, payout, {
      type: "MARKETPLACE_PAYOUT",
      description: `Vente de l'agent « ${agent.name} » — payout ${Math.round((1 - listing.commission) * 100)} % (commission plateforme ${Math.round(listing.commission * 100)} %)`,
      refType: "listing",
      refId: listingId,
    })
  }

  // 3. Trace d'achat + compteurs.
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
      forkedAgentId: null,
    },
  })
  await db.agentListing.update({
    where: { id: listingId },
    data: {
      purchases: { increment: 1 },
      revenue: { increment: listing.price },
    },
  })

  // 4. Fork de l'agent pour l'acheteur.
  const forkedAgent = await db.agent.create({
    data: {
      userId: buyerId,
      name: `${agent.name} (acquis)`,
      slug: `${agent.slug}-acq-${Date.now()}`,
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
  await db.purchase.update({ where: { id: purchase.id }, data: { forkedAgentId: forkedAgent.id } })

  logger.info("Achat agent (commission 20 %)", {
    purchaseId: purchase.id, buyerId, sellerId: agent.userId, agentId: agent.id,
    forkId: forkedAgent.id, price: listing.price, commission, payout,
  })
  return {
    purchaseId: purchase.id,
    success: true,
    forkedAgentId: forkedAgent.id,
    charged: listing.price,
    payout,
  }
}

/**
 * Revenus du vendeur : ventes, payouts cumulés, commission versée.
 */
export async function sellerRevenue(userId: string) {
  const [purchases, totals] = await Promise.all([
    db.purchase.findMany({
      where: { sellerId: userId, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.purchase.aggregate({
      where: { sellerId: userId, status: "COMPLETED" },
      _sum: { amount: true, payout: true, commission: true },
      _count: { _all: true },
    }),
  ])
  return {
    sales: totals._count._all,
    grossRevenue: totals._sum.amount ?? 0,
    totalPayout: totals._sum.payout ?? 0,
    platformCommission: totals._sum.commission ?? 0,
    history: purchases.map((p) => ({
      id: p.id,
      amount: p.amount,
      payout: p.payout,
      commission: p.commission,
      createdAt: p.createdAt.toISOString(),
    })),
  }
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
