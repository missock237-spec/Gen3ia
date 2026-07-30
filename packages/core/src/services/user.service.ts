// ============================================================
// User Service — Logique metier des utilisateurs
// ============================================================

import { userRepository } from '../repositories/index.js';
import { ValidationError, NotFoundError, BusinessError } from '../errors.js';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  credits: number;
  plan: string;
  createdAt: Date;
}

class UserService {
  async getProfile(userId: string): Promise<UserProfile> {
    const user = await userRepository.findById(userId, {
      id: true, name: true, email: true,
      credits: true, plan: true, createdAt: true,
    });
    if (!user) throw new NotFoundError('User', userId);
    return user as unknown as UserProfile;
  }

  async updateProfile(userId: string, data: { name?: string; email?: string }) {
    if (data.email && !this.isValidEmail(data.email)) {
      throw new ValidationError('EMAIL_INVALID', "Format d'email invalide");
    }
    return userRepository.update(userId, data);
  }

  async getUserStats(userId: string) {
    const user = await userRepository.findByIdOrThrow(userId);
    return {
      credits: (user as any).credits ?? 0,
      plan: (user as any).plan ?? 'free',
      memberSince: (user as any).createdAt,
    };
  }

  async checkAccess(userId: string, requiredPlan?: string): Promise<boolean> {
    const user = await userRepository.findById(userId, { plan: true });
    if (!user) return false;
    if (!requiredPlan) return true;
    const planHierarchy: Record<string, number> = {
      free: 0, starter: 1, pro: 2, enterprise: 3,
    };
    const userPlanLevel = planHierarchy[(user as any).plan ?? 'free'] ?? 0;
    const requiredLevel = planHierarchy[requiredPlan] ?? 0;
    return userPlanLevel >= requiredLevel;
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}

export const userService = new UserService();
