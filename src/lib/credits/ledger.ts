import { db } from "@/lib/db"

/**
 * Credit Ledger — toute variation de solde passe par une transaction
 * enregistrée. Le solde n'est JAMAIS modifié directement : il est
 * recalculé comme balanceAfter de la dernière écriture (piste d'audit
 * complète et rejouable).
 */

export class InsufficientCreditsError extends Error {
  needed: number
  balance: number

  constructor(needed: number, balance: number) {
    super(
      `Crédits insuffisants : ${needed.toFixed(2)} requis, ${balance.toFixed(2)} disponibles. Rechargez votre compte dans la section Facturation.`
    )
    this.needed = needed
    this.balance = balance
  }
}

export interface LedgerEntry {
  type: string
  description: string
  /** Optionnel : le montant réel est passé en paramètre de chargeCredits. */
  amount?: number
  refType?: string
  refId?: string
}

/** Débit atomique : vérifie le solde, débite, écrit la transaction. */
export async function chargeCredits(
  userId: string,
  amount: number,
  entry: LedgerEntry
): Promise<{ balanceAfter: number }> {
  if (amount <= 0) {
    // Évite les débits nuls/négatifs dans le journal.
    const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { credits: true } })
    return { balanceAfter: user.credits }
  }
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, credits: true },
    })
    if (user.credits < amount) {
      throw new InsufficientCreditsError(amount, user.credits)
    }
    const balanceAfter = Math.round((user.credits - amount) * 1000) / 1000
    await tx.user.update({ where: { id: userId }, data: { credits: balanceAfter } })
    await tx.transaction.create({
      data: {
        userId,
        type: entry.type,
        amount: -Math.round(amount * 1000) / 1000,
        balanceAfter,
        description: entry.description,
        refType: entry.refType ?? null,
        refId: entry.refId ?? null,
      },
    })
    return { balanceAfter }
  })
}

/** Crédit atomique : recharge, bonus, remboursement. */
export async function grantCredits(
  userId: string,
  amount: number,
  entry: LedgerEntry
): Promise<{ balanceAfter: number }> {
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, credits: true },
    })
    const balanceAfter = Math.round((user.credits + amount) * 1000) / 1000
    await tx.user.update({ where: { id: userId }, data: { credits: balanceAfter } })
    await tx.transaction.create({
      data: {
        userId,
        type: entry.type,
        amount: Math.round(amount * 1000) / 1000,
        balanceAfter,
        description: entry.description,
        refType: entry.refType ?? null,
        refId: entry.refId ?? null,
      },
    })
    return { balanceAfter }
  })
}

export async function getBalance(userId: string): Promise<number> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { credits: true },
  })
  return user.credits
}

export async function getTransactions(userId: string, limit = 50) {
  return db.transaction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  })
}
