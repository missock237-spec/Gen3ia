import { db } from "@/lib/db"

/**
 * Portefeuille publicitaire — ledger dédié à la page Publicités (/ads).
 * Toute variation de solde (recharge, dépense de campagne, remboursement)
 * passe par une transaction enregistrée ; le solde n'est jamais modifié
 * directement (piste d'audit complète, même discipline que le Credit
 * Ledger). Le règlement des budgets de campagne est « paresseux » :
 * il est calculé à chaque consultation (compatible serverless).
 */

export const AD_RECHARGE_MIN_FCFA = 1000
export const AD_RECHARGE_MAX_FCFA = 10_000_000

export class InsufficientAdBalanceError extends Error {
  needed: number
  balance: number

  constructor(needed: number, balance: number) {
    super(
      `Solde publicitaire insuffisant : ${needed.toLocaleString("fr-FR")} FCFA requis, ${balance.toLocaleString("fr-FR")} FCFA disponibles. Rechargez votre portefeuille publicitaire.`
    )
    this.needed = needed
    this.balance = balance
  }
}

/** Récupère (ou crée) le portefeuille publicitaire de l'utilisateur. */
export async function ensureAdWallet(userId: string) {
  const existing = await db.adWallet.findUnique({ where: { userId } })
  if (existing) return existing
  return db.adWallet.create({ data: { userId, balance: 0 } })
}

/** Crédit atomique du portefeuille (recharge Chariow, remboursement). */
export async function creditAdWallet(
  userId: string,
  amount: number,
  entry: { type: "RECHARGE" | "REFUND"; description: string; paymentId?: string }
): Promise<{ balanceAfter: number }> {
  if (amount <= 0) {
    const w = await ensureAdWallet(userId)
    return { balanceAfter: w.balance }
  }
  await ensureAdWallet(userId)
  return db.$transaction(async (tx) => {
    const wallet = await tx.adWallet.findUniqueOrThrow({
      where: { userId },
      select: { id: true, balance: true },
    })
    const balanceAfter = Math.round((wallet.balance + amount) * 100) / 100
    await tx.adWallet.update({ where: { id: wallet.id }, data: { balance: balanceAfter } })
    await tx.adTransaction.create({
      data: {
        walletId: wallet.id,
        type: entry.type,
        amount: Math.round(amount * 100) / 100,
        balanceAfter,
        description: entry.description,
        paymentId: entry.paymentId ?? null,
      },
    })
    return { balanceAfter }
  })
}

/** Débit atomique — refuse si le solde est insuffisant. */
export async function debitAdWallet(
  userId: string,
  amount: number,
  entry: { type: "SPEND" | "REFUND"; description: string; campaignId?: string }
): Promise<{ balanceAfter: number }> {
  if (amount <= 0) {
    const w = await ensureAdWallet(userId)
    return { balanceAfter: w.balance }
  }
  await ensureAdWallet(userId)
  return db.$transaction(async (tx) => {
    const wallet = await tx.adWallet.findUniqueOrThrow({
      where: { userId },
      select: { id: true, balance: true },
    })
    if (wallet.balance < amount) {
      throw new InsufficientAdBalanceError(amount, wallet.balance)
    }
    const balanceAfter = Math.round((wallet.balance - amount) * 100) / 100
    await tx.adWallet.update({ where: { id: wallet.id }, data: { balance: balanceAfter } })
    await tx.adTransaction.create({
      data: {
        walletId: wallet.id,
        type: entry.type,
        amount: -Math.round(amount * 100) / 100,
        balanceAfter,
        description: entry.description,
        campaignId: entry.campaignId ?? null,
      },
    })
    return { balanceAfter }
  })
}

/**
 * Règlement paresseux des budgets de campagnes ACTIVES :
 * pour chaque campagne, débite le budget journalier × jours écoulés
 * depuis lastChargeAt (borné par le solde disponible). Une campagne
 * dont le budget ne peut plus être débité est mise en PAUSE
 * (« solde épuisé ») — jamais de solde négatif.
 */
export async function settleCampaignSpends(
  userId: string
): Promise<{ settledCampaigns: number; totalDebited: number; paused: string[] }> {
  await ensureAdWallet(userId)
  const active = await db.adCampaign.findMany({
    where: { userId, status: "ACTIVE", budgetPerDay: { gt: 0 } },
  })
  let totalDebited = 0
  const paused: string[] = []

  for (const campaign of active) {
    const now = new Date()
    const since = campaign.lastChargeAt ?? campaign.startDate ?? campaign.createdAt
    // Jours entamés (chaque jour commencé est dû).
    const days = Math.max(0, Math.ceil((now.getTime() - since.getTime()) / 86_400_000))
    if (days === 0) continue
    const due = Math.round(campaign.budgetPerDay * days * 100) / 100
    if (due <= 0) continue

    const wallet = await db.adWallet.findUniqueOrThrow({
      where: { userId },
      select: { balance: true },
    })

    if (wallet.balance <= 0) {
      await db.adCampaign.update({
        where: { id: campaign.id },
        data: { status: "PAUSED" },
      })
      paused.push(campaign.id)
      continue
    }

    // Le débit est borné par le solde : on paie ce qu'on peut, la
    // campagne est mise en pause si le solde ne couvre pas le dû.
    const payable = Math.min(due, Math.round(wallet.balance * 100) / 100)
    try {
      await debitAdWallet(userId, payable, {
        type: "SPEND",
        description: `Budget campagne « ${campaign.name} » — ${days} jour(s) × ${campaign.budgetPerDay.toLocaleString("fr-FR")} FCFA`,
        campaignId: campaign.id,
      })
      totalDebited += payable
      await db.adCampaign.update({
        where: { id: campaign.id },
        data: {
          totalSpent: { increment: payable },
          lastChargeAt: new Date(),
          ...(payable < due ? { status: "PAUSED" } : {}),
        },
      })
      if (payable < due) paused.push(campaign.id)
    } catch {
      // Concurrence : le portefeuille a changé entre-temps — réessai au
      // prochain règlement (paresseux, jamais bloquant).
      await db.adCampaign.update({
        where: { id: campaign.id },
        data: { status: "PAUSED" },
      })
      paused.push(campaign.id)
    }
  }

  return { settledCampaigns: active.length, totalDebited, paused }
}

/** Historique du portefeuille + campagnes + créas (vue complète /ads). */
export async function adsOverview(userId: string) {
  const wallet = await ensureAdWallet(userId)
  // Règle les budgets dus avant l'affichage (settlement paresseux).
  await settleCampaignSpends(userId)
  const [transactions, campaigns, wallet2] = await Promise.all([
    db.adTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.adCampaign.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { creatives: { orderBy: { createdAt: "desc" } } },
    }),
    db.adWallet.findUniqueOrThrow({ where: { userId }, select: { balance: true } }),
  ])
  return {
    balance: wallet2.balance,
    transactions,
    campaigns: campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      platform: c.platform,
      objective: c.objective,
      status: c.status,
      budgetPerDay: c.budgetPerDay,
      totalSpent: c.totalSpent,
      targetUrl: c.targetUrl,
      startDate: c.startDate,
      endDate: c.endDate,
      createdAt: c.createdAt,
      creatives: c.creatives.map((cr) => ({
        id: cr.id,
        headline: cr.headline,
        body: cr.body,
        cta: cr.cta,
        mediaUrl: cr.mediaUrl,
        status: cr.status,
        createdAt: cr.createdAt,
      })),
    })),
  }
}
