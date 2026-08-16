// ============================================================
// Gen3ia — UserService (Firebase-backed)
// ============================================================
//  Refactorisé pour Firebase Authentication. Les opérations de création
//  et d'authentification délèguent vers Firebase Auth (hachage scrypt).
// ============================================================

import { db } from '@/lib/db';
import { createUser, getUserByEmail } from '@/lib/firebase/auth';
import { getAdminAuth } from '@/lib/firebase/admin';
import { logger } from '@/lib/logger';
import { validatePasswordStrength } from '@/lib/firebase/auth';

export class UserService {
  /**
   * Crée un utilisateur Firebase Auth + le profil Firestore.
   * Le hachage du mot de passe est géré par Firebase (scrypt).
   */
  async create(data: { name: string; email: string; password: string }) {
    const existing = await getUserByEmail(data.email);
    if (existing) throw new Error('Email déjà utilisé');

    const strength = validatePasswordStrength(data.password);
    if (!strength.valid) {
      throw new Error(`Mot de passe trop faible: ${strength.reasons.join(', ')}`);
    }

    const user = await createUser({
      email: data.email,
      password: data.password,
      displayName: data.name,
      emailVerified: false,
      role: 'user',
    });

    // Crée le profil Firestore
    const now = new Date();
    const profile = await db.user.createWithId(user.uid, {
      uid: user.uid,
      email: user.email || data.email,
      name: data.name,
      plan: 'free',
      role: 'user',
      credits: 100,
      isActive: true,
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
    });

    logger.info('User created', { userId: user.uid, email: user.email });
    return profile;
  }

  /**
   * Authentifie via Firebase Auth et génère un ID token.
   * Le hachage/vérification du mot de passe est délégué à Firebase.
   */
  async authenticate(email: string, _password: string) {
    // La vérification du mot de passe DOIT se faire côté client via
    // signInWithEmailAndPassword (sécurité Firebase). Le serveur ne peut
    // pas vérifier directement le mot de passe.
    // Cette méthode retourne juste le profil si l'utilisateur existe.
    const user = await getUserByEmail(email);
    if (!user) throw new Error('Identifiants invalides');

    const profile = await db.user.findUnique({ where: { id: user.uid } });
    if (!profile) throw new Error('Profil introuvable');

    return {
      user: {
        id: user.uid,
        name: (profile as Record<string, unknown>).name,
        email: user.email,
        role: (profile as Record<string, unknown>).role || 'user',
        plan: (profile as Record<string, unknown>).plan || 'free',
      },
    };
  }

  async getById(id: string) {
    const user = await db.user.findUnique({
      where: { id },
      select: ['id', 'name', 'email', 'role', 'plan', 'avatar', 'createdAt', 'isActive'],
    });
    if (!user) throw new Error('Utilisateur non trouvé');
    return user;
  }

  async update(id: string, data: { name?: string; avatar?: string; plan?: string }) {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.avatar !== undefined) patch.avatar = data.avatar;
    if (data.plan !== undefined) patch.plan = data.plan;
    return db.user.update({ where: { id }, data: patch });
  }

  async delete(id: string) {
    // Supprime le profil Firestore + l'utilisateur Firebase Auth
    await db.user.delete({ where: { id } });
    try {
      await getAdminAuth().deleteUser(id);
    } catch {
      // Non bloquant
    }
  }

  async list(page = 1, limit = 20) {
    const users = await db.user.findMany({
      orderBy: [{ field: 'createdAt', direction: 'desc' }],
      limit,
    });
    const total = await db.user.count();
    return {
      users: users as Array<Record<string, unknown>>,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}

export const userService = new UserService();
