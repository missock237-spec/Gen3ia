// ============================================================
// Credit Service — Gestion des credits utilisateurs
// ============================================================

import { userRepository, creditTransactionRepository } from '../repositories/index.js';
import { BusinessError, NotFoundError } from '../errors.js';

class CreditService {
  async hasSufficientCredits(userId: string, amount: number): Promise<boolean> {
    const user = await userRepository.findById(userId, { credits: true });
    if (!user) return false;
    return ((user as any).credits ?? 0) >= amount;
  }

  async deductCredits(userId: string, amount: number, description: string) {
    const user = await userRepository.findByIdOrThrow(userId);
    const currentCredits = (user as any).credits ?? 0;
    if (currentCredits < amount) {
      throw new BusinessError('INSUFFICIENT_CREDITS', 'Credits insuffisants');
    }
    const updatedUser = await userRepository.deductCredits(userId, amount);
    await creditTransactionRepository.create({
      userId,
      amount: -amount,
      type: 'usage',
      description,
    });
    return updatedUser;
  }

  async addCredits(userId: string, amount: number, description: string) {
    if (amount <= 0) {
      throw new BusinessError('INVALID_AMOUNT', 'Le montant doit etre positif');
    }
    const updatedUser = await userRepository.addCredits(userId, amount);
    await creditTransactionRepository.create({
      userId,
      amount,
      type: 'purchase',
      description,
    });
    return updatedUser;
  }

  async getTransactionHistory(userId: string, limit = 50, offset = 0) {
    const transactions = await creditTransactionRepository.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
    const total = await creditTransactionRepository.count({ userId });
    return { transactions, total, limit, offset };
  }

  async getCreditsBalance(userId: string): Promise<number> {
    const user = await userRepository.findById(userId, { credits: true });
    if (!user) throw new NotFoundError('User', userId);
    return (user as any).credits ?? 0;
  }
}

export const creditService = new CreditService();
