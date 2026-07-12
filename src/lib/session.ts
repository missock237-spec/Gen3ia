import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAuditLog, generateSessionToken } from '@/lib/auth'
import { createLogger } from '@/lib/logger'

const log = createLogger('session')

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000
export const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const MAX_SESSIONS_PER_USER = 10

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

interface CreateSessionOptions {
  ipAddress?: string | null
  userAgent?: string | null
  rememberMe?: boolean
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
  options: CreateSessionOptions = {}
): Promise<{ token: string; refreshToken: string }> {
  const token = generateSessionToken()
  const refreshToken = crypto.randomBytes(48).toString('hex')
  const tokenHash = hashSessionToken(token)
  const refreshTokenHash = hashSessionToken(refreshToken)

  const rememberMe = options.rememberMe ?? false
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_MS)

  const activeSessions = await db.session.findMany({
    where: {
      userId,
      expiresAt: { gt: new Date() },
    },
    orderBy: { lastAccessedAt: 'asc' },
    select: { id: true },
  })

  if (activeSessions.length >= MAX_SESSIONS_PER_USER) {
    const sessionsToRemove = activeSessions.slice(
      0,
      activeSessions.length - MAX_SESSIONS_PER_USER + 1
    )
    const idsToRemove = sessionsToRemove.map((s) => s.id)

    await db.session
      .deleteMany({
        where: { id: { in: idsToRemove } },
      })
      .catch(() => {})

    log.info('Evicted oldest sessions for user', {
      userId,
      evictedCount: idsToRemove.length,
    })

    await createAuditLog({
      userId,
      action: 'session_evict',
      resource: 'session',
      details: {
        evictedCount: idsToRemove.length,
        reason: 'max_sessions_exceeded',
      },
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      severity: 'info',
    })
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
    details: {
      expiresAt: expiresAt.toISOString(),
      rememberMe,
    },
    ipAddress: options.ipAddress,
    userAgent: options.userAgent,
    severity: 'info',
  })

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

  await db.session
    .update({
      where: { token: tokenHash },
      data: { lastAccessedAt: new Date() },
    })
    .catch(() => {})

  return session.userId
}

export async function refreshSession(
  refreshToken: string
): Promise<{ token: string; refreshToken: string } | null> {
  if (!refreshToken) return null

  const refreshTokenHash = hashSessionToken(refreshToken)

  const session = await db.session.findUnique({
    where: { refreshToken: refreshTokenHash },
    select: {
      id: true,
      userId: true,
      refreshExpiresAt: true,
    },
  })

  if (!session) return null

  if (session.refreshExpiresAt && session.refreshExpiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }

  const newToken = generateSessionToken()
  const newRefreshToken = crypto.randomBytes(48).toString('hex')

  const newExpiresAt = new Date(Date.now() + SESSION_TTL_MS)
  const newRefreshExpiresAt = new Date(Date.now() + REFRESH_TTL_MS)

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

  await createAuditLog({
    userId: session.userId,
    action: 'session_refresh',
    resource: 'session',
    resourceId: session.id,
    severity: 'info',
  })

  return { token: newToken, refreshToken: newRefreshToken }
}

export async function getCurrentSession(): Promise<SessionPayload | null> {
  try {
    const { cookies } = await import('next/headers')
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE)?.value

    if (!token) return null

    const tokenHash = hashSessionToken(token)

    const session = await db.session.findUnique({
      where: { token: tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            isEmailVerified: true,
          },
        },
      },
    })

    if (!session) return null

    if (session.expiresAt < new Date()) {
      await db.session.delete({ where: { id: session.id } }).catch(() => {})
      return null
    }

    if (!session.user.isActive) return null

    await db.session
      .update({
        where: { id: session.id },
        data: { lastAccessedAt: new Date() },
      })
      .catch(() => {})

    return {
      userId: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
      isActive: session.user.isActive,
      isEmailVerified: session.user.isEmailVerified,
      sessionId: session.id,
    }
  } catch {
    return null
  }
}

// Fixed: use NextRequest instead of native Request for consistency with Next.js App Router
export async function destroySession(request: NextRequest): Promise<void> {
  try {
    const { cookies } = await import('next/headers')
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE)?.value

    if (!token) return

    const tokenHash = hashSessionToken(token)

    const session = await db.session.findUnique({
      where: { token: tokenHash },
      select: { id: true, userId: true },
    })

    if (!session) return

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'

    await db.session.delete({ where: { id: session.id } }).catch(() => {})

    await createAuditLog({
      userId: session.userId,
      action: 'logout',
      resource: 'session',
      ipAddress: ip,
      userAgent: request.headers.get('user-agent') ?? 'unknown',
    })
  } catch {
    // no-op
  }
}

export function extractToken(request: NextRequest): string | null {
  const cookieToken = request.cookies.get(SESSION_COOKIE)?.value
  if (cookieToken) return cookieToken

  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }

  return null
}

export function extractRefreshToken(request: NextRequest): string | null {
  const cookieToken = request.cookies.get(REFRESH_COOKIE)?.value
  if (cookieToken) return cookieToken

  const headerToken = request.headers.get('x-refresh-token')
  if (headerToken) return headerToken

  return null
}

export async function getAuthenticatedUser(
  request: NextRequest
): Promise<{ userId: string; role?: string } | null> {
  const token = extractToken(request)
  if (!token) return null

  const userId = await validateSession(token)
  if (!userId) return null

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  })

  return {
    userId,
    role: user?.role || 'user',
  }
}

export function setSessionCookie(
  response: NextResponse,
  token: string,
  rememberMe = false
): void {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: getSameSite(),
    maxAge: rememberMe ? SESSION_TTL_MS / 1000 : undefined,
    path: '/',
  })
}

export function setRefreshCookie(
  response: NextResponse,
  refreshToken: string
): void {
  response.cookies.set(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: getSameSite(),
    maxAge: REFRESH_TTL_MS / 1000,
    path: '/',
  })
}

export function refreshSessionCookie(
  response: NextResponse,
  token: string,
  refreshToken: string
): void {
  setSessionCookie(response, token)
  setRefreshCookie(response, refreshToken)
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: getSameSite(),
    maxAge: 0,
    path: '/',
  })

  response.cookies.set(REFRESH_COOKIE, '', {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: getSameSite(),
    maxAge: 0,
    path: '/',
  })
}

export async function deleteSession(token: string): Promise<void> {
  const tokenHash = hashSessionToken(token)

  const session = await db.session.findUnique({
    where: { token: tokenHash },
    select: { userId: true },
  })

  await db.session.delete({ where: { token: tokenHash } }).catch(() => {})

  if (session) {
    await createAuditLog({
      userId: session.userId,
      action: 'logout',
      resource: 'session',
      severity: 'info',
    })
  }
}

export async function deleteSessionByRefreshToken(
  refreshToken: string
): Promise<void> {
  const refreshTokenHash = hashSessionToken(refreshToken)

  const session = await db.session.findUnique({
    where: { refreshToken: refreshTokenHash },
    select: { userId: true },
  })

  await db.session
    .delete({ where: { refreshToken: refreshTokenHash } })
    .catch(() => {})

  if (session) {
    await createAuditLog({
      userId: session.userId,
      action: 'session_revoke_refresh',
      resource: 'session',
      severity: 'info',
    })
  }
}

// Fixed: was truncated in source — completed with deleteMany + audit log
export async function deleteAllUserSessions(userId: string): Promise<void> {
  const result = await db.session.deleteMany({
    where: { userId },
  })

  await createAuditLog({
    userId,
    action: 'session_revoke_all',
    resource: 'session',
    details: { deletedCount: result.count },
    severity: 'warning',
  })
}
