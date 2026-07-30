// ============================================================
// UserRepository
// ============================================================

import { BaseRepository } from './base.repository';

export interface UserData {
  id: string;
  email: string;
  name: string | null;
  password: string | null;
  avatar: string | null;
  plan: string;
  role: string;
  credits: number;
  isActive: boolean;
  isEmailVerified: boolean;
  lastActiveAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  email: string;
  name?: string;
  password?: string;
  plan?: string;
  role?: string;
}

export interface UpdateUserInput {
  name?: string;
  avatar?: string;
  plan?: string;
  role?: string;
  credits?: number;
  isActive?: boolean;
  isEmailVerified?: boolean;
  lastActiveAt?: Date;
  password?: string;
}

class UserRepository extends BaseRepository<UserData, CreateUserInput, UpdateUserInput> {
  protected tableName = 'user';

  async findByEmail(email: string): Promise<UserData | null> {
    return this.findByUnique({ email });
  }

  async deductCredits(userId: string, amount: number): Promise<UserData> {
    const user = await this.findByIdOrThrow(userId);
    const newCredits = Math.max(0, (user.credits || 0) - amount);
    return this.update(userId, { credits: newCredits } as any);
  }

  async addCredits(userId: string, amount: number): Promise<UserData> {
    const user = await this.findByIdOrThrow(userId);
    return this.update(userId, { credits: (user.credits || 0) + amount } as any);
  }
}

export const userRepository = new UserRepository();
