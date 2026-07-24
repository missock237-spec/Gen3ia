import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const video = await db.videoGeneration.findUnique({
      where: { id: params.id },
      select: { id: true, prompt: true, model: true, status: true, videoUrl: true, costUsd: true, durationSeconds: true, width: true, height: true, createdAt: true, metadata: true },
    });
    if (!video) return NextResponse.json({ error: 'Vidéo non trouvée' }, { status: 404 });
    return NextResponse.json(video);
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
