import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
export async function GET(request: NextRequest) {
  const u = new URL(request.url).searchParams;
  const uid = u.get('userId');
  const pg = parseInt(u.get('page') ?? '1');
  const lim = parseInt(u.get('limit') ?? '20');
  if (!uid) return NextResponse.json({ error: 'userId requis' }, { status: 400 });
  const [imgs, tot] = await Promise.all([
    db.imageGeneration.findMany({ where: { userId: uid }, orderBy: { createdAt: 'desc' }, skip: (pg - 1) * lim, take: lim, select: { id: true, prompt: true, model: true, imageUrl: true, status: true, costUsd: true, createdAt: true } }),
    db.imageGeneration.count({ where: { userId: uid } }),
  ]);
  return NextResponse.json({ images: imgs, pagination: { page: pg, limit: lim, total: tot, totalPages: Math.ceil(tot / lim) } });
}
export async function POST(request: NextRequest) {
  try {
    const b = await request.json();
    const { userId, prompt, model } = b;
    if (!userId || !prompt) return NextResponse.json({ error: 'userId et prompt requis' }, { status: 400 });
    const gen = await import('@/lib/image-generator');
    const r = await gen.imageGenerator.generate({ userId, prompt, model });
    if (!r.success) return NextResponse.json({ error: r.error || 'Echec' }, { status: 502 });
    return NextResponse.json({ success: true, imageUrl: r.imageUrl, generationId: r.generationId });
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
