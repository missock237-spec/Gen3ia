import { prisma } from '@/lib/db';
import { hash as argon2Hash, verify as argon2Verify } from 'argon2';
import jwt from 'jsonwebtoken';
import { env } from '@/lib/env';
import { cookies } from 'next/headers';

const JWT_SECRET = () => env.JWT_SECRET() || env.AUTH_SECRET() || 'fallback-secret';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const SESSION_COOKIE = 'genova_session';
const REFRESH_COOKIE = 'genova_refresh';

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  type?: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

export async function hashPassword(password: string): Promise<string> {
  return argon2Hash(password, { type: 2, memoryCost: 65536, timeCost: 3, parallelism: 4, hashLength: 32 });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try { return await argon2Verify(hash, password); }
  catch { return false; }
}

function signToken(payload: Omit<JWTPayload, 'iat' | 'exp'>, expiresIn: string): string {
  return jwt.sign(payload, JWT_SECRET(), { expiresIn });
}

export function signAccessToken(user: { id: string; email: string; role: string }): string {
  return signToken({ userId: user.id, email: user.email, role: user.role, type: 'access' }, ACCESS_TOKEN_EXPIRY);
}

export function signRefreshToken(userId: string): string {
  return signToken({ userId, email: '', role: '', type: 'refresh' }, REFRESH_TOKEN_EXPIRY);
}

export function verifyToken(token: string): JWTPayload | null {
  try { return jwt.verify(token, JWT_SECRET()) as JWTPayload; }
  catch { return null; }
}

export async function createSession(userId: string, rememberMe = false): Promise<{ accessToken: string; refreshToken: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('Utilisateur non trouvé');
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(userId);
  const expiresAt = new Date(Date.now() + (rememberMe ? 30 : 7) * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { token: refreshToken, userId, expiresAt, rememberMe } });
  return { accessToken, refreshToken };
}

export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string } | null> {
  const payload = verifyToken(refreshToken);
  if (!payload || payload.type !== 'refresh') return null;
  const session = await prisma.session.findUnique({ where: { token: refreshToken } });
  if (!session || session.expiresAt < new Date()) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return null;
  const newAccessToken = signAccessToken(user);
  const newRefreshToken = signRefreshToken(user.id);
  await prisma.session.update({ where: { id: session.id }, data: { token: newRefreshToken, lastAccessedAt: new Date() } });
  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

export async function getServerSession(): Promise<JWTPayload | null> {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get(SESSION_COOKIE)?.value;
    if (!accessToken) return null;
    const payload = verifyToken(accessToken);
    if (!payload || payload.type !== 'access') return null;
    const session = await prisma.session.findFirst({ where: { userId: payload.userId, expiresAt: { gt: new Date() } } });
    if (!session) return null;
    return payload;
  } catch { return null; }
}

export async function destroySession(refreshToken: string): Promise<void> {
  await prisma.session.deleteMany({ where: { token: refreshToken } });
}

export { SESSION_COOKIE, REFRESH_COOKIE };
