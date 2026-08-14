// ============================================================
// UserService — tests unitaires
// ============================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const userRepository = {
  findById: vi.fn(),
  findByIdOrThrow: vi.fn(),
  update: vi.fn(),
};

vi.mock('../repositories/index.js', () => ({ userRepository }));

import { userService } from './user.service.js';
import { NotFoundError, ValidationError } from '../errors.js';

describe('UserService', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('getProfile', () => {
    it('returns the user profile', async () => {
      const user = { id: 'u1', name: 'Julio', email: 'j@x.com', credits: 5, plan: 'pro', createdAt: new Date() };
      userRepository.findById.mockResolvedValue(user);
      await expect(userService.getProfile('u1')).resolves.toEqual(user);
      expect(userRepository.findById).toHaveBeenCalledWith('u1', {
        id: true, name: true, email: true, credits: true, plan: true, createdAt: true,
      });
    });

    it('throws NotFoundError when user missing', async () => {
      userRepository.findById.mockResolvedValue(null);
      await expect(userService.getProfile('u1')).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('updateProfile', () => {
    it('updates when email is valid', async () => {
      userRepository.update.mockResolvedValue({ id: 'u1', name: 'N' });
      const res = await userService.updateProfile('u1', { name: 'N', email: 'ok@x.com' });
      expect(userRepository.update).toHaveBeenCalledWith('u1', { name: 'N', email: 'ok@x.com' });
      expect(res).toEqual({ id: 'u1', name: 'N' });
    });

    it('throws ValidationError on invalid email', async () => {
      await expect(userService.updateProfile('u1', { email: 'pas-un-email' })).rejects.toBeInstanceOf(ValidationError);
      expect(userRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('getUserStats', () => {
    it('returns credits, plan and memberSince', async () => {
      const d = new Date('2024-01-01');
      userRepository.findByIdOrThrow.mockResolvedValue({ credits: 20, plan: 'pro', createdAt: d });
      const stats = await userService.getUserStats('u1');
      expect(stats).toEqual({ credits: 20, plan: 'pro', memberSince: d });
    });
  });

  describe('checkAccess', () => {
    it('returns false when user missing', async () => {
      userRepository.findById.mockResolvedValue(null);
      await expect(userService.checkAccess('u1')).resolves.toBe(false);
    });

    it('returns true when no required plan', async () => {
      userRepository.findById.mockResolvedValue({ plan: 'free' });
      await expect(userService.checkAccess('u1')).resolves.toBe(true);
    });

    it('grants access when user plan level >= required', async () => {
      userRepository.findById.mockResolvedValue({ plan: 'pro' });
      await expect(userService.checkAccess('u1', 'starter')).resolves.toBe(true);
    });

    it('denies access when user plan below required', async () => {
      userRepository.findById.mockResolvedValue({ plan: 'free' });
      await expect(userService.checkAccess('u1', 'pro')).resolves.toBe(false);
    });
  });
});
