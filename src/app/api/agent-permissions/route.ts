import { NextResponse, type NextRequest } from 'next/server';
import { permissionManager, PermissionScope } from '@/lib/agent-permissions';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const agentId = searchParams.get('agentId');

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const grants = await permissionManager.getUserGrants(userId);
    const filtered = agentId ? grants.filter((g) => g.agentId === agentId) : grants;

    return NextResponse.json({ success: true, grants: filtered });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to list permissions' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, userId, scopes, conditions } = body;

    if (!agentId || typeof agentId !== 'string') {
      return NextResponse.json({ error: 'agentId is required and must be a string' }, { status: 400 });
    }

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'userId is required and must be a string' }, { status: 400 });
    }

    if (!Array.isArray(scopes)) {
      return NextResponse.json({ error: 'scopes must be an array' }, { status: 400 });
    }

    // Validate scope strings against enum values
    const validScopes = Object.values(PermissionScope);
    const invalidScopes = scopes.filter((s: any) => !validScopes.includes(s));
    if (invalidScopes.length > 0) {
      return NextResponse.json(
        { error: `Invalid scopes: ${invalidScopes.join(', ')}` },
        { status: 400 }
      );
    }

    const grant = await permissionManager.grantPermissions(
      agentId,
      userId,
      scopes as PermissionScope[],
      conditions
    );

    return NextResponse.json({ success: true, grant });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to grant permissions' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    let agentId = searchParams.get('agentId');
    let userId = searchParams.get('userId');

    if (!agentId || !userId) {
      try {
        const body = await request.json();
        agentId = agentId || body.agentId;
        userId = userId || body.userId;
      } catch {
        // ignore body parsing error if query params are expected
      }
    }

    if (!agentId || !userId) {
      return NextResponse.json(
        { error: 'agentId and userId are required' },
        { status: 400 }
      );
    }

    await permissionManager.revokePermissions(agentId, userId);

    return NextResponse.json({
      success: true,
      message: `Permissions revoked for agent ${agentId} and user ${userId}`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to revoke permissions' },
      { status: 500 }
    );
  }
}
