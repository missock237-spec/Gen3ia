import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth.config';
import { getAllUsers, searchUsers, getUserById, updateUserPlan, toggleUserActive, updateUserRole, deleteUser, isAdminRole, logAdminAction } from '@/lib/admin';





export const dynamic = "force-dynamic";
async function verifyAdmin(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user && isAdminRole(session.user.role)) {
    return { userId: session.user.id, role: session.user.role };
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const { verifyAccessToken } = await import('@/lib/auth');
    const payload = verifyAccessToken(authHeader.slice(7));
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
    if (userId) { const user = await getUserById(userId); if (!user) return NextResponse.json({ error: 'Utilisateur non trouve' }, { status: 404 }); return NextResponse.json({ user }); }
    if (search) { const users = await searchUsers(search); return NextResponse.json({ users, total: users.length }); }
    return NextResponse.json(await getAllUsers(page, limit));
  } catch (err) { return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 }); }
}

export async function PATCH(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Non autorise' }, { status: 403 });
  try {
    const body = await request.json();
    const { userId, action, value } = body;
    if (!userId || !action) return NextResponse.json({ error: 'userId et action requis' }, { status: 400 });
    switch (action) {
      case 'updatePlan': await updateUserPlan(userId, value); await logAdminAction(admin.userId, 'update_plan:' + userId, value); return NextResponse.json({ success: true });
      case 'toggleActive': await toggleUserActive(userId, value); await logAdminAction(admin.userId, 'toggle_active:' + userId, String(value)); return NextResponse.json({ success: true });
      case 'updateRole': await updateUserRole(userId, value); await logAdminAction(admin.userId, 'update_role:' + userId, value); return NextResponse.json({ success: true });
      case 'delete': await deleteUser(userId); await logAdminAction(admin.userId, 'delete_user:' + userId, 'Supprime'); return NextResponse.json({ success: true });
      default: return NextResponse.json({ error: 'Action inconnue' }, { status: 400 });
    }
  } catch (err) { return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 }); }
}