// ============================================================
// GET|POST|PATCH /api/agents/roles — Gestion des roles/permissions
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { applySecurity } from '@/lib/security';





export const dynamic = "force-dynamic";
const log = createLogger('agent-roles');

const VALID_PERMISSIONS = [
  'browse_web', 'social_post', 'social_youtube', 'social_facebook',
  'social_instagram', 'social_tiktok', 'social_linkedin',
  'use_api', 'use_cpu', 'use_mvp',
];

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  const agentId = request.nextUrl.searchParams.get('agentId');
  if (!agentId) return NextResponse.json({ error: 'agentId required' }, { status: 400 });

  const permissions = await db.agentPermission.findMany({
    where: { agentId, userId: auth.userId },
    select: { permission: true, granted: true, requiresApproval: true },
  });

  return NextResponse.json({ permissions });
}

export async function PATCH(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body = await request.json();
    const { agentId, permission, granted, requiresApproval } = body;

    if (!agentId || !permission) {
      return NextResponse.json({ error: 'agentId and permission required' }, { status: 400 });
    }

    if (!VALID_PERMISSIONS.includes(permission)) {
      return NextResponse.json({ error: `Invalid permission. Valid: ${VALID_PERMISSIONS.join(', ')}` }, { status: 400 });
    }

    const updated = await db.agentPermission.updateMany({
      where: { agentId, permission, userId: auth.userId },
      data: {
        ...(granted !== undefined ? { granted } : {}),
        ...(requiresApproval !== undefined ? { requiresApproval } : {}),
      },
    });

    log.info('permission_updated', { agentId, permission, granted, requiresApproval });

    return NextResponse.json({ success: true, updated: updated.count });
  } catch (error) {
    log.error('permission_update_error', { error: String(error) });
    return NextResponse.json({ error: 'Failed to update permission' }, { status: 500 });
  }
}
