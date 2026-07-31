import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth.config';
import {
  getAllUsers, searchUsers, getUserById,
  updateUserPlan, toggleUserActive, updateUserRole, deleteUser,
  isAdminRole, logAdminAction,
} from '@/lib/admin';

async function verifyAdmin(request: NextRequest) {
  // 1. Authentification NextAuth (session HTTP-only)
  const session = await getServerSession(authOptions);
  if (session?.user) {
    const role = (session.user as any).role;
    if (isAdminRole(role)) return { userId: (session.user as any).id, role };
  }

  // 2. Fallback: Bearer token JWT
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const { verifyAccessToken } = await import('@/lib/auth');
    const payload = verifyAccessToken(token);
    if (payload && isAdminRole(payload.role)) return payload;
  }

  return null;
}

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Non autorise' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const search = searchParams.get('search') || '';
  const userId = searchParams.get('userId') || '';

  try {
    if (userId) {
      const user = await getUserById(userId);
      if (!user) return NextResponse.json({ error: 'Utilisateur non trouve' }, { status: 404 });
      return NextResponse.json({ user });
    }
    if (search) {
      const users = await searchUsers(search);
      return NextResponse.json({ users, total: users.length });
    }
    const result = await getAllUsers(page, limit);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[Admin Users Error]:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Non autorise' }, { status: 403 });

  try {
    const body = await request.json();
    const { userId, action, value } = body;
    if (!userId || !action) return NextResponse.json({ error: 'userId et action requis' }, { status: 400 });

    switch (action) {
      case 'updatePlan':
        await updateUserPlan(userId, value);
        await logAdminAction(admin.userId, 'update_plan:' + userId, 'Plan mis a jour');
        return NextResponse.json({ success: true });
      case 'toggleActive':
        await toggleUserActive(userId, value);
        await logAdminAction(admin.userId, 'toggle_active:' + userId, value ? 'Active' : 'Desactive');
        return NextResponse.json({ success: true });
      case 'updateRole':
        await updateUserRole(userId, value);
        await logAdminAction(admin.userId, 'update_role:' + userId, 'Role mis a jour');
        return NextResponse.json({ success: true });
      case 'delete':
        await deleteUser(userId);
        await logAdminAction(admin.userId, 'delete_user:' + userId, 'Utilisateur supprime');
        return NextResponse.json({ success: true });
      default:
        return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
    }
  } catch (err) {
    console.error('[Admin PATCH Error]:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}