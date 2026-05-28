/**
 * GENOVA AI OS — GET /api/auth/me
 * Returns current authenticated user data.
 * Uses getCurrentSession() for cookie-based auth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentSession, extractToken, validateSession } from '@/lib/session';

<<<<<<< HEAD
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Try cookie-based session first
    const session = await getCurrentSession();

    if (session) {
      const user = await db.user.findUnique({
        where: { id: session.userId },
        select: {
          id: true,
          email: true,
          name: true,
          plan: true,
          avatar: true,
          role: true,
          isEmailVerified: true,
          isActive: true,
          createdAt: true,
        },
      });

      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      return NextResponse.json({
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        avatar: user.avatar,
        role: user.role || 'user',
        emailVerified: user.isEmailVerified,
        isEmailVerified: user.isEmailVerified,
        isActive: user.isActive,
      });
    }

    // Fallback: check Authorization header / cookie token manually
    const token = extractToken(request);
    if (!token) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const userId = await validateSession(token);
    if (!userId) {
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
    }
=======
export async function OPTIONS(request: NextRequest) {
  const { error } = await applySecurity(request);
  if (error) return error;
  return new NextResponse(null, { status: 204 });
}
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, {
    requireAuth: true,
  });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const user = await db.user.findUnique({
<<<<<<< HEAD
      where: { id: userId },
=======
      where: { id: auth.userId },
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
        avatar: true,
<<<<<<< HEAD
        role: true,
        isEmailVerified: true,
        isActive: true,
=======
        emailVerified: true,
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)
        createdAt: true,
      },
    });

    if (!user) {
<<<<<<< HEAD
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      plan: user.plan,
      avatar: user.avatar,
      role: user.role || 'user',
      emailVerified: user.isEmailVerified,
      isEmailVerified: user.isEmailVerified,
      isActive: user.isActive,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 });
=======
      const res = NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
      return secureResponse(res, request);
    }

    const res = NextResponse.json(user);
    return secureResponse(res, request);
  } catch {
    const res = NextResponse.json(
      { error: 'Failed to fetch user' },
      { status: 500 }
    );
    return secureResponse(res, request);
>>>>>>> 2f7c5f3 (5433aca4-1e96-4e29-8166-a30aceccff4d)
  }
}
