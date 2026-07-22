import { prisma } from '@/lib/db';
import { hash as argon2Hash, verify as argon2Verify } from 'argon2';
import jwt from 'jsonwebtoken';
import { env } from '@/lib/env';
import { cookies } from 'next/headers';

const JWT_SECRET = () => env.JWT_SECRET() || env.AUTH_SECRET() || 'fallback-secret-do-not-use-in-production';
const SESSION_COOKIE = 'genova_session';

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

/**
 * Hashage sécurisé avec Argon2id
 * - Argon2id est le vainqueur du concours PHC (Password Hashing Competition)
 * - Résistant aux attaques GPU et ASIC
 * - Type: Argon2id (hybride entre Argon2i et Argon2d)
 * - Mémoire: 64 MiB (protection anti-GPU)
 * - Itérations: 3
 * - Parallélisme: 4 threads
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2Hash(password, {
    type: 2, // argon2id
    memoryCost: 65536, // 64 MiB
    timeCost: 3,
    parallelism: 4,
    hashLength: 32,
  });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2Verify(hash, password);
  } catch {
    return false;
  }
}

export function signToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET(), { expiresIn: '7d' });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET()) as JWTPayload;
  } catch {
    return null;
  }
}

export async function createSession(userId: string, rememberMe = false): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('Utilisateur non trouvé');

  const token = signToken({ userId, email: user.email, role: user.role });
  const expiresAt = new Date(Date.now() + (rememberMe ? 30 : 7) * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: { token, userId, expiresAt, rememberMe },
  });

  return token;
}

export async function validateSession(token: string): Promise<JWTPayload | null> {
  const payload = verifyToken(token);
  if (!payload) return null;

  const session = await prisma.session.findUnique({ where: { token } });
  if (!session || session.expiresAt < new Date()) return null;

  await prisma.session.update({
    where: { id: session.id },
    data: { lastAccessedAt: new Date() },
  });

  return payload;
}

export async function destroySession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { token } });
}

export async function getServerSession(): Promise<JWTPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    return validateSession(token);
  } catch {
    return null;
  }
}

export async function requireAuth(): Promise<JWTPayload> {
  const session = await getServerSession();
  if (!session) throw new Error('Authentication required');
  return session;
}

export { SESSION_COOKIE };
