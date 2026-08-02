import { NextRequest, NextResponse } from 'next/server';
import { getPlatformStats, getRevenueStats, getAdminLogs, isAdminRole } from '@/lib/admin';
import { verifyAccessToken } from '@/lib/auth';





export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  
  if (!token) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  }

  const payload = verifyAccessToken(token);
  if (!payload || !isAdminRole(payload.role)) {
    return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 });
  }

  try {
    const [stats, revenue, logs] = await Promise.all([
      getPlatformStats(),
      getRevenueStats(),
      getAdminLogs(20),
    ]);

    return NextResponse.json({
      stats,
      revenue,
      logs,
      admin: {
        id: payload.userId,
        email: payload.email,
        plan: 'enterprise',
        role: 'admin',
      },
    });
  } catch (err) {
    console.error('[Admin Stats Error]:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
