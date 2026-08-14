import { FieldValue } from 'firebase-admin/firestore';
import { BaseRepository } from './base.repository.js';

// ============================================================
// UserRepository — collection Firestore 'users'
// ============================================================

export interface UserRecord extends Record<string, unknown> {
  id: string;
  name?: string;
  email?: string;
  credits?: number;
  plan?: string;
  createdAt?: Date;
}

export class UserRepository extends BaseRepository<UserRecord> {
  constructor() {
    super('users');
  }

  async deductCredits(userId: string, amount: number): Promise<UserRecord> {
    const docRef = this.db().collection('users').doc(userId);
    await docRef.update({ credits: FieldValue.increment(-amount) });
    const snap = await docRef.get();
    const data = snap.data() ?? {};
    return { ...data, id: snap.id } as UserRecord;
  }

  async addCredits(userId: string, amount: number): Promise<UserRecord> {
    const docRef = this.db().collection('users').doc(userId);
    await docRef.update({ credits: FieldValue.increment(amount) });
    const snap = await docRef.get();
    const data = snap.data() ?? {};
    return { ...data, id: snap.id } as UserRecord;
  }
}

export const userRepository = new UserRepository();
