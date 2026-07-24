import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
export async function GET(r: NextRequest) {
  try {
    const listings = await db.marketplaceListing.findMany({ where: { status: 'published', isActive: true }, orderBy: { createdAt: 'desc' }, take: 50, include: { _count: { select: { purchases: true } }, user: { select: { name: true } } } });
    return NextResponse.json(listings);
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
export async function POST(r: NextRequest) {
  try {
    const b = await r.json();
    const { name, description, type, price, userId } = b;
    if (!name || !description || !userId) return NextResponse.json({ error: 'name, description et userId requis' }, { status: 400 });
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const l = await db.marketplaceListing.create({ data: { name, slug, description, type: type || 'agent', price: price || 0, userId } });
    return NextResponse.json(l, { status: 201 });
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
