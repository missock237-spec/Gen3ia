import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';





export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const session = await getServerSession();
    if (!session?.user.id) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

    const projects = await prisma.codeProject.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, language: true, fileCount: true, updatedAt: true, createdAt: true },
      take: 50,
    });

    return NextResponse.json({ projects });
  } catch (_error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user.id) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

    const { name, language, files } = await request.json();
    if (!name || !language) {
      return NextResponse.json({ error: 'Nom et langage requis' }, { status: 400 });
    }

    const project = await prisma.codeProject.create({
      data: {
        name,
        language,
        userId: session.user.id,
        fileCount: files?.length || 1,
        files: JSON.stringify(files || [{ name: 'main.' + language, content: '', language }]),
      },
    });

    return NextResponse.json({ project, message: 'Projet cree' }, { status: 201 });
  } catch (_error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user.id) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });

    const project = await prisma.codeProject.findUnique({ where: { id } });
    if (!project || project.userId !== session.user.id) {
      return NextResponse.json({ error: 'Projet non trouve' }, { status: 404 });
    }

    await prisma.codeProject.delete({ where: { id } });
    return NextResponse.json({ message: 'Projet supprime' });
  } catch (_error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user.id) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

    const { id, name, files } = await request.json();
    if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });

    const project = await prisma.codeProject.findUnique({ where: { id } });
    if (!project || project.userId !== session.user.id) {
      return NextResponse.json({ error: 'Projet non trouve' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (name) updateData.name = name;
    if (files) {
      updateData.files = JSON.stringify(files);
      updateData.fileCount = files.length;
    }

    const updated = await prisma.codeProject.update({ where: { id }, data: updateData });
    return NextResponse.json({ project: updated });
  } catch (_error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
