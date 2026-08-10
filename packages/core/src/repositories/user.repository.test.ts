// ============================================================
// UserRepository — tests unitaires
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = { user: {} };
vi.mock('../db.js', () => ({ db }));
vi.mock('../logger.js', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { userRepository } from './user.repository.js';

const base = { id: 'u1', email: 'a@b.c', name: null, password: null, avatar: null, plan: 'free', role: 'user', credits: 10, isActive: true, isEmailVerified: false, lastActiveAt: null, createdAt: new Date(), updatedAt: new Date() };

beforeEach(() => {
  db.user.findUnique = vi.fn().mockResolvedValue(base);
  db.user.update = vi.fn().mockImplementation(({ where, data }) => ({ ...base, ...data }));
});

describe('UserRepository', () => {
  describe('findByEmail', () => {
    it('delegates to findByUnique with email', async () => {
      await expect(userRepository.findByEmail('a@b.c')).resolves.toEqual(base);
      expect(db.user.findUnique).toHaveBeenCalledWith({ where: { email: 'a@b.c' } });
    });
  });

  describe('deductCredits', () => {
    it('reduces credits without going below zero', async () => {
      const res = await userRepository.deductCredits('u1', 4);
      expect(res.credits).toBe(6);
      expect(db.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { credits: 6 } });
    });
  });

  describe('addCredits', () => {
    it('adds credits', async () => {
      const res = await userRepository.addCredits('u1', 5);
      expect(res.credits).toBe(15);
    });
  });
});
