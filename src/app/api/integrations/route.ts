import { NextRequest, NextResponse } from 'next/server';
import { getIntegrationManager, N8nClient } from '@/lib/integrations/n8n-client';
import { getAuthenticatedUser } from '@/lib/session';

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action') || 'list';
  const service = searchParams.get('service');

  try {
    const manager = getIntegrationManager();

    switch (action) {
      case 'list': {
        const integrations = await manager.getUserIntegrations(user.userId);
        const available = manager.getAvailableIntegrations();
        return NextResponse.json({
          connected: integrations,
          available,
        });
      }

      case 'health': {
        const health = await manager.healthCheck();
        return NextResponse.json(health);
      }

      case 'logs': {
        if (!service) {
          return NextResponse.json({ error: 'Service requis' }, { status: 400 });
        }
        const logs = await manager.getExecutionLogs(user.userId, service);
        return NextResponse.json({ logs });
      }

      default:
        return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur interne';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, service, credentials, credentialName } = body;

    if (!action || !service) {
      return NextResponse.json({ error: 'Action et service requis' }, { status: 400 });
    }

    const manager = getIntegrationManager();

    switch (action) {
      case 'connect': {
        if (!credentials) {
          return NextResponse.json({ error: 'Credentials requis' }, { status: 400 });
        }
        const result = await manager.connectService(
          user.userId,
          service,
          credentials,
          credentialName
        );
        return NextResponse.json(result);
      }

      case 'disconnect': {
        await manager.disconnectService(user.userId, service);
        return NextResponse.json({ success: true });
      }

      case 'test': {
        const result = await manager.testConnection(user.userId, service);
        return NextResponse.json(result);
      }

      case 'create-workflow': {
        const n8n = new N8nClient();
        const { name, template, activate } = body;
        if (!name || !template) {
          return NextResponse.json({ error: 'Nom et template requis' }, { status: 400 });
        }
        const workflow = await manager.createUserWorkflow(
          user.userId,
          name,
          template,
          activate
        );
        return NextResponse.json(workflow);
      }

      default:
        return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur interne';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
