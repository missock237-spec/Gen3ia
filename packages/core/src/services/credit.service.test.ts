// ============================================================
// CreditService — tests unitaires
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const userRepository = {
  findById: vi.fn(),
  findByIdOrThrow: vi.fn(),
  deductCredits: vi.fn(),
  addCredits: vi.fn(),
};
const creditTransactionRepository = {
  create: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
};

vi.mock('../repositories/index.js', () => ({
  userRepository,
  creditTransactionRepository,
}));

import { creditService } from './credit.service.js';
import { BusinessError, NotFoundError } from '../errors.js';

describe('CreditService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hasSufficientCredits', () => {
    it('returns true when balance >= amount', async () => {
      userRepository.findById.mockResolvedValue({ credits: 100 });
      await expect(creditService.hasSufficientCredits('u1', 50)).resolves.toBe(true);
      expect(userRepository.findById).toHaveBeenCalledWith('u1', { credits: true });
    });

    it('returns false when user not found', async () => {
      userRepository.findById.mockResolvedValue(null);
      await expect(creditService.hasSufficientCredits('u1', 50)).resolves.toBe(false);
    });

    it('returns false when balance < amount', async () => {
      userRepository.findById.mockResolvedValue({ credits: 10 });
      await expect(creditService.hasSufficientCredits('u1', 50)).resolves.toBe(false);
    });
  });

  describe('deductCredits', () => {
    it('deducts and records a transaction', async () => {
      userRepository.findByIdOrThrow.mockResolvedValue({ credits: 100 });
      userRepository.deductCredits.mockResolvedValue({ credits: 40 });
      const result = await creditService.deductCredits('u1', 60, 'usage IA');
      expect(userRepository.deductCredits).toHaveBeenCalledWith('u1', 60);
      expect(creditTransactionRepository.create).toHaveBeenCalledWith({
        userId: 'u1', amount: -60, type: 'usage', description: 'usage IA',
      });
      expect(result).toEqual({ credits: 40 });
    });

    it('throws BusinessError when insufficient credits', async () => {
      userRepository.findByIdOrThrow.mockResolvedValue({ credits: 5 });
      await expect(creditService.deductCredits('u1', 60, 'x')).rejects.toBeInstanceOf(BusinessError);
      expect(userRepository.deductCredits).not.toHaveBeenCalled();
    });
  });

  describe('addCredits', () => {
    it('adds credits and records a purchase transaction', async () => {
      userRepository.addCredits.mockResolvedValue({ credits: 150 });
      const result = await creditService.addCredits('u1', 50, 'achat pack');
      expect(userRepository.addCredits).toHaveBeenCalledWith('u1', 50);
      expect(creditTransactionRepository.create).toHaveBeenCalledWith({
        userId: 'u1', amount: 50, type: 'purchase', description: 'achat pack',
      });
      expect(result).toEqual({ credits: 150 });
    });

    it('throws BusinessError when amount <= 0', async () => {
      await expect(creditService.addCredits('u1', 0, 'x')).rejects.toBeInstanceOf(BusinessError);
      await expect(creditService.addCredits('u1', -5, 'x')).rejects.toBeInstanceOf(BusinessError);
    });
  });

  describe('getCreditsBalance', () => {
    it('returns current balance', async () => {
      userRepository.findById.mockResolvedValue({ credits: 42 });
      await expect(creditService.getCreditsBalance('u1')).resolves.toBe(42);
    });

    it('throws NotFoundError when user missing', async () => {
      userRepository.findById.mockResolvedValue(null);
      await expect(creditService.getCreditsBalance('u1')).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('getTransactionHistory', () => {
    it('returns paginated transactions and total', async () => {
      const tx = [{ id: 't1' }, { id: 't2' }];
      creditTransactionRepository.findMany.mockResolvedValue(tx);
      creditTransactionRepository.count.mockResolvedValue(10);
      const res = await creditService.getTransactionHistory('u1', 50, 0);
      expect(res.transactions).toHaveLength(2);
      expect(res.total).toBe(10);
      expect(creditTransactionRepository.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1' }, orderBy: { createdAt: 'desc' }, take: 50, skip: 0,
      });
    });
  });
});
