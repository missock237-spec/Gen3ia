import { NextRequest, NextResponse } from 'next/server';
import {
  getAllUsers,
  searchUsers,
  getUserById,
  updateUserPlan,
  toggleUserActive,
  updateUserRole,
  deleteUser,
  isAdminRole,
  logAdminAction,
} from '@/lib/admin';
import { verifyAccessToken } from '@/lib/auth';

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  
  if (!token) {
    const session = request.cookies.get('genova_session')?.value;
    if (!session) return null;
    // Vérifier la session en DB ici (à implémenter avec Prisma)
    return { userId: 'admin', role: 'admin' };
  }

  const payload = verifyAccessToken(token);
  if (!payload || !isAdminRole(payload.role)) return null;
  return payload;
}

export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const search = searchParams.get('search') || '';
  const userId = searchParams.get('userId') || '';

  try {
    if (userId) {
      const user = await getUserById(userId);
      if (!user) return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
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
  if (!admin) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { userId, action, value } = body;

    if (!userId || !action) {
      return NextResponse.json({ error: 'userId et action requis' }, { status: 400 });
    }

    switch (action) {
      case 'updatePlan':
        await updateUserPlan(userId, value);
        await logAdminAction(admin.userId, `update_plan:${userId}`, `Plan mis à jour vers ${value}`);
        return NextResponse.json({ success: true, message: `Plan mis à jour vers ${value}` });

      case 'toggleActive':
        await toggleUserActive(userId, value);
        await logAdminAction(admin.userId, `toggle_active:${userId}`, value ? 'Compte activé' : 'Compte désactivé');
        return NextResponse.json({ success: true, message: value ? 'Compte activé' : 'Compte désactivé' });

      case 'updateRole':
        await updateUserRole(userId, value);
        await logAdminAction(admin.userId, `update_role:${userId}`, `Rôle mis à jour vers ${value}`);
        return NextResponse.json({ success: true, message: `Rôle mis à jour vers ${value}` });

      case 'delete':
        await deleteUser(userId);
        await logAdminAction(admin.userId, `delete_user:${userId}`, 'Utilisateur supprimé');
        return NextResponse.json({ success: true, message: 'Utilisateur supprimé' });

      default:
        return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
    }
  } catch (err) {
    console.error('[Admin PATCH Error]:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
