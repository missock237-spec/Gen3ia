import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAuditLog, generateSessionToken } from '@/lib/auth'

const SESSION_DURATION_HOURS = 24
const REFRESH_TOKEN_DURATION_HOURS = 168
const MAX_SESSIONS_PER_USER = 10

const SESSION_COOKIE = 'genova_session'
const REFRESH_COOKIE = 'genova_refresh'

export interface SessionPayload {
  userId: string
  email: string
  name: string
  role: string
  isActive: boolean
  isEmailVerified: boolean
  sessionId: string
}

function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function isSecureCookie(): boolean {
  if (process.env.COOKIE_SECURE === 'true') return true
  return process.env.NODE_ENV === 'production'
}

function getSameSite(): 'lax' | 'strict' | 'none' {
  const value = (process.env.SESSION_COOKIE_SAMESITE || 'lax').toLowerCase()
  if (value === 'strict' || value === 'none') return value
  return 'lax'
}

export async function createSession(
  userId: string,
  options: { ipAddress?: string | null; userAgent?: string | null; rememberMe?: boolean } = {}
): Promise<{ token: string; refreshToken: string }> {
  const token = generateSessionToken()
  const refreshToken = crypto.randomBytes(48).toString('hex')
  const tokenHash = hashSessionToken(token)
  const refreshTokenHash = hashSessionToken(refreshToken)

  const rememberMe = options.rememberMe ?? false
  const expiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000)
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_DURATION_HOURS * 60 * 60 * 1000)

  const activeSessions = await db.session.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { lastAccessedAt: 'asc' },
    select: { id: true },
  })

  if (activeSessions.length >= MAX_SESSIONS_PER_USER) {
    const excess = activeSessions.length - MAX_SESSIONS_PER_USER + 1
    const idsToRemove = activeSessions.slice(0, excess).map(s => s.id)
    await db.session.deleteMany({ where: { id: { in: idsToRemove } } }).catch(() => {})
  }

  await db.session.create({
    data: {
      token: tokenHash,
      userId,
      refreshToken: refreshTokenHash,
      expiresAt,
      refreshExpiresAt,
      rememberMe,
      ipAddress: options.ipAddress || null,
      userAgent: options.userAgent || null,
    },
  })

  await createAuditLog({
    userId,
    action: 'session_create',
    resource: 'session',
    details: { expiresAt: expiresAt.toISOString(), rememberMe },
    ipAddress: options.ipAddress,
    userAgent: options.userAgent,
    severity: 'info',
  }).catch(() => {})

  return { token, refreshToken }
}

export async function validateSession(token: string): Promise<string | null> {
  if (!token) return null
  const tokenHash = hashSessionToken(token)

  const session = await db.session.findUnique({
    where: { token: tokenHash },
    select: { userId: true, expiresAt: true },
  })

  if (!session) return null
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { token: tokenHash } }).catch(() => {})
    return null
  }

  await db.session.update({
    where: { token: tokenHash },
    data: { lastAccessedAt: new Date() },
  }).catch(() => {})

  return session.userId
}

export async function refreshSession(refreshToken: string): Promise<{ token: string; refreshToken: string } | null> {
  if (!refreshToken) return null
  const refreshTokenHash = hashSessionToken(refreshToken)

  const session = await db.session.findUnique({
    where: { refreshToken: refreshTokenHash },
    select: { id: true, userId: true, refreshExpiresAt: true },
  })

  if (!session) return null
  if (session.refreshExpiresAt && session.refreshExpiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }

  const newToken = generateSessionToken()
  const newRefreshToken = crypto.randomBytes(48).toString('hex')
  const newExpiresAt = new Date(Date.now() + SESSION_DURATION_HOURS * 60 * 60 * 1000)
  const newRefreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_DURATION_HOURS * 60 * 60 * 1000)

  await db.session.update({
    where: { id: session.id },
    data: {
      token: hashSessionToken(newToken),
      refreshToken: hashSessionToken(newRefreshToken),
      expiresAt: newExpiresAt,
      refreshExpiresAt: newRefreshExpiresAt,
      lastAccessedAt: new Date(),
    },
  })

  return { token: newToken, refreshToken: newRefreshToken }
}

export function extractToken(request: NextRequest): string | null {
  const cookieToken = request.cookies.get(SESSION_COOKIE)?.value
  if (cookieToken) return cookieToken
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7)
  return null
}

export function extractRefreshToken(request: NextRequest): string | null {
  const cookieToken = request.cookies.get(REFRESH_COOKIE)?.value
  if (cookieToken) return cookieToken
  const headerToken = request.headers.get('x-refresh-token')
  if (headerToken) return headerToken
  return null
}

export function setSessionCookie(response: NextResponse, token: string, rememberMe = false): void {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: getSameSite(),
    maxAge: rememberMe ? SESSION_DURATION_HOURS * 3600 : undefined,
    path: '/',
  })
}

export function setRefreshCookie(response: NextResponse, refreshToken: string): void {
  response.cookies.set(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: getSameSite(),
    maxAge: REFRESH_TOKEN_DURATION_HOURS * 3600,
    path: '/',
  })
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, secure: isSecureCookie(), sameSite: getSameSite(), maxAge: 0, path: '/' })
  response.cookies.set(REFRESH_COOKIE, '', { httpOnly: true, secure: isSecureCookie(), sameSite: getSameSite(), maxAge: 0, path: '/' })
}

export async function deleteSession(token: string): Promise<void> {
  const tokenHash = hashSessionToken(token)
  const session = await db.session.findUnique({ where: { token: tokenHash }, select: { userId: true } })
  await db.session.delete({ where: { token: tokenHash } }).catch(() => {})
  if (session) {
    await createAuditLog({ userId: session.userId, action: 'logout', resource: 'session', severity: 'info' }).catch(() => {})
  }
}

export async function deleteAllUserSessions(userId: string): Promise<void> {
  await db.session.deleteMany({ where: { userId } }).catch(() => {})
}

/**
 * Get the authenticated user from the request
 * Extracts the session token and validates it, returning the user info
 */
export async function getAuthenticatedUser(request: NextRequest): Promise<{
  userId: string;
  email: string;
  name: string;
  role: string;
} | null> {
  const token = extractToken(request);
  if (!token) return null;

  const userId = await validateSession(token);
  if (!userId) return null;

  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true },
    });
    return user;
  } catch {
    return null;
  }
}

// Nettoyage périodique des sessions expirées
if (typeof globalThis !== 'undefined') {
  const g = globalThis as unknown as { _sessionCleanup?: NodeJS.Timeout }
  if (!g._sessionCleanup && process.env.NODE_ENV !== 'test') {
    g._sessionCleanup = setInterval(async () => {
      try { await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }) } catch {}
    }, 60 * 60 * 1000)
  }
}
