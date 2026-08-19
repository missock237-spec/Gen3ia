import { NextResponse, type NextRequest } from 'next/server';
import { permissionManager, PermissionScope, PermissionCheckResult } from '@/lib/agent-permissions';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, userId, scopes, scope, resource } = body;

    if (!agentId || typeof agentId !== 'string') {
      return NextResponse.json({ error: 'agentId is required and must be a string' }, { status: 400 });
    }

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'userId is required and must be a string' }, { status: 400 });
    }

    let result: PermissionCheckResult;

    if (Array.isArray(scopes)) {
      result = await permissionManager.checkMultiple(agentId, userId, scopes as PermissionScope[]);
    } else if (scope) {
      result = await permissionManager.checkPermission(agentId, userId, scope as PermissionScope, resource);
    } else {
      return NextResponse.json(
        { error: 'Either scopes (array) or scope (string) is required' },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to check permission' },
      { status: 500 }
    );
  }
}
