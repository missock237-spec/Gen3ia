// API Marketplace - Listings enrichis avec badges (Firestore facade)
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { withAuth, type RouteParams } from '@/lib/with-auth';
import type { FirestoreWhereOp, FirestoreOrderBy } from '@/lib/firebase/firestore';




export const dynamic = "force-dynamic";
const log = createLogger('marketplace');

const VALID_TYPES = ['agent', 'tool', 'workflow', 'template', 'prompt', 'integration'];

type MarketplaceSort = 'newest' | 'popular' | 'rating' | 'trust';

// Colonne Firestore correspondant à chaque tri
const SORT_FIELD: Record<MarketplaceSort, string> = {
  newest: 'createdAt',
  popular: 'reviewCount',
  rating: 'rating',
  trust: 'trustScore',
};

interface ListingLike {
  id?: string;
  badges?: string | unknown[];
  name?: string;
  [key: string]: unknown;
}

// GET /api/marketplace — Listing public (lecture)
export async function GET(request: NextRequest) {
  try {
    const type = request.nextUrl.searchParams.get('type');
    const search = request.nextUrl.searchParams.get('search');
    const page = Math.max(1, parseInt(request.nextUrl.searchParams.get('page') || '1'));
    const limit = Math.min(50, Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') || '20')));
    const sort = (request.nextUrl.searchParams.get('sort') || 'newest') as MarketplaceSort;

    // where === FirestoreWhereOp[] (pas d'objet Prisma, pas de contains/mode)
    const where: FirestoreWhereOp[] = [
      { field: 'status', op: '==', value: 'published' },
      { field: 'isActive', op: '==', value: true },
    ];
    if (type && VALID_TYPES.includes(type)) where.push({ field: 'type', op: '==', value: type });

    const sortField = SORT_FIELD[sort] || 'createdAt';
    const orderBy: FirestoreOrderBy[] = [{ field: sortField, direction: 'desc' }];

    // La façade ne supporte ni contains/mode ni include. On récupère la liste
    // filtrée (triée), puis on applique recherche + pagination en mémoire.
    const all = (await db.marketplaceListing.findMany({ where, orderBy })) as ListingLike[];

    let rows = all;
    if (search) {
      const q = search.toLowerCase();
      rows = all.filter((l) => (l.name || '').toLowerCase().includes(q));
    }

    const total = rows.length;
    const paged = rows.slice((page - 1) * limit, page * limit);

    const enriched = paged.map((l) => ({
      ...l,
      badges: typeof l.badges === 'string' ? JSON.parse(l.badges) : Array.isArray(l.badges) ? l.badges : [],
    }));

    return NextResponse.json({
      success: true,
      data: enriched,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    log.error('marketplace_list_error', { error: String(error) });
    return NextResponse.json({ error: 'Erreur de chargement' }, { status: 500 });
  }
}

// POST /api/marketplace — Creation de listing (auth requise)
export const POST = withAuth(async (request: NextRequest, ctx: { params?: RouteParams }, auth) => {
  try {
    const body = await request.json();
    const { name, description, type, price, agentId, config } = body;
    if (!name || name.trim().length < 3) return NextResponse.json({ error: 'Nom requis (min 3 caracteres)' }, { status: 400 });
    if (!description || description.length < 10) return NextResponse.json({ error: 'Description requise' }, { status: 400 });

    const listingType = type && VALID_TYPES.includes(type) ? type : 'agent';
    const priceNum = Math.max(0, Number(price) || 0);

    if (agentId && listingType === 'agent') {
      const agent = await db.agent.findUnique({ where: { id: agentId }, select: ['userId'] });
      if (!agent || (agent as Record<string, unknown>).userId !== auth.userId) return NextResponse.json({ error: 'Agent introuvable' }, { status: 403 });
    }

    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);

    const listing = await db.marketplaceListing.create({
      data: {
        name: name.trim(),
        slug,
        description,
        type: listingType,
        price: priceNum,
        userId: auth.userId,
        agentId: agentId || null,
        config: config ? JSON.stringify(config) : '{}',
        status: 'published',
        isActive: true,
        reviewCount: 0,
        rating: 0,
        trustScore: 0,
      },
    });

    log.info('marketplace_listing_created', { id: listing.id, name: listing.name });
    return NextResponse.json({ success: true, data: listing }, { status: 201 });
  } catch (error) {
    log.error('marketplace_create_error', { error: String(error) });
    return NextResponse.json({ error: 'Erreur de creation' }, { status: 500 });
  }
}, {
  requireAuth: true,
  roles: ['user'],
  rateLimit: { limit: 10, windowMs: 60000 },
});
