// ============================================================
// CreditRepository — tests unitaires
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = { creditTransaction: {} };
vi.mock('../db.js', () => ({ db }));
vi.mock('../logger.js', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { creditTransactionRepository } from './credit.repository.js';

const tx = [
  { id: 't1', userId: 'u1', amount: 50 },
  { id: 't2', userId: 'u1', amount: -20 },
];

beforeEach(() => {
  db.creditTransaction.findMany = vi.fn().mockResolvedValue(tx);
});

describe('CreditTransactionRepository', () => {
  describe('findByUserId', () => {
    it('returns recent transactions', async () => {
      const res = await creditTransactionRepository.findByUserId('u1');
      expect(res).toHaveLength(2);
      expect(db.creditTransaction.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1' }, orderBy: { createdAt: 'desc' }, take: 100,
      });
    });
  });

  describe('getBalance', () => {
    it('sums transaction amounts', async () => {
      await expect(creditTransactionRepository.getBalance('u1')).resolves.toBe(30);
    });
  });
});
