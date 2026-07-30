// CreditRepository
import { BaseRepository } from './base.repository';

export interface CreditTransactionData {
  id: string; type: string; amount: number;
  description: string; reference: string | null;
  userId: string; createdAt: Date;
}

export interface CreateTransactionInput {
  type: string; amount: number; description?: string;
  reference?: string; userId: string;
}

class CreditTransactionRepository extends BaseRepository<CreditTransactionData, CreateTransactionInput> {
  protected tableName = 'creditTransaction';

  async findByUserId(userId: string): Promise<CreditTransactionData[]> {
    return this.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async getBalance(userId: string): Promise<number> {
    const transactions = await this.findMany({ where: { userId } });
    return transactions.reduce((sum, t) => sum + t.amount, 0);
  }
}

export const creditTransactionRepository = new CreditTransactionRepository();