import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';

const VALID_SERVICES = [
  'github', 'gitlab', 'google', 'slack', 'notion', 'gmail',
  'google_calendar', 'google_drive', 'discord', 'twitter',
  'linkedin', 'dropbox', 'spotify', 'hubspot', 'salesforce',
] as const;

type Service = (typeof VALID_SERVICES)[number];

interface AuthorizationBody {
  service: Service;
  accessToken: string;
  refreshToken?: string;
  accountId: string;
  accountName: string;
  scopes?: string[];
  expiresAt?: string;
}

// GET /api/authorizations - Liste les authorizations de l'utilisateur
export async function GET() {
  try {
    const session = await getServerSession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const authorizations = await prisma.workflowAuthorization.findMany({
      where: { userId: session.userId },
      select: {
        id: true,
        service: true,
        accountId: true,
        accountName: true,
        scopes: true,
        isActive: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ authorizations });
  } catch (error) {
    console.error('GET /authorizations error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST /api/authorizations - Connecte un nouveau service
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const body: AuthorizationBody = await request.json();

    if (!body.service || !VALID_SERVICES.includes(body.service)) {
      return NextResponse.json({ error: 'Service invalide' }, { status: 400 });
    }

    if (!body.accessToken || !body.accountId || !body.accountName) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 });
    }

    const existing = await prisma.workflowAuthorization.findFirst({
      where: {
        userId: session.userId,
        service: body.service,
        accountId: body.accountId,
      },
    });

    if (existing) {
      const updated = await prisma.workflowAuthorization.update({
        where: { id: existing.id },
        data: {
          accessToken: body.accessToken,
          refreshToken: body.refreshToken ?? null,
          accountName: body.accountName,
          scopes: body.scopes ?? [],
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          isActive: true,
        },
      });

      return NextResponse.json({
        authorization: {
          id: updated.id,
          service: updated.service,
          accountId: updated.accountId,
          accountName: updated.accountName,
          scopes: updated.scopes,
          isActive: updated.isActive,
        },
        message: 'Autorisation mise à jour',
      });
    }

    const authorization = await prisma.workflowAuthorization.create({
      data: {
        userId: session.userId,
        service: body.service,
        accessToken: body.accessToken,
        refreshToken: body.refreshToken ?? null,
        accountId: body.accountId,
        accountName: body.accountName,
        scopes: body.scopes ?? [],
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });

    return NextResponse.json(
      {
        authorization: {
          id: authorization.id,
          service: authorization.service,
          accountId: authorization.accountId,
          accountName: authorization.accountName,
          scopes: authorization.scopes,
          isActive: authorization.isActive,
        },
        message: 'Service connecté avec succès',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('POST /authorizations error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// DELETE /api/authorizations?service=xxx&accountId=xxx
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const service = searchParams.get('service');
    const accountId = searchParams.get('accountId');

    if (!service || !accountId) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 });
    }

    await prisma.workflowAuthorization.deleteMany({
      where: {
        userId: session.userId,
        service,
        accountId,
      },
    });

    return NextResponse.json({ message: 'Service déconnecté avec succès' });
  } catch (error) {
    console.error('DELETE /authorizations error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
