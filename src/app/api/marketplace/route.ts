// API Marketplace - Listings enrichis avec badges et trust
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { withAuth, type RouteParams } from '@/lib/with-auth';
const log = createLogger('marketplace');

const VALID_TYPES = ['agent', 'tool', 'workflow', 'template', 'prompt', 'integration'];

type MarketplaceSort = 'newest' | 'popular' | 'rating' | 'trust';

// GET /api/marketplace — Listing public (lecture)
export async function GET(request: NextRequest) {
  try {
    const type = request.nextUrl.searchParams.get('type');
    const search = request.nextUrl.searchParams.get('search');
    const page = Math.max(1, parseInt(request.nextUrl.searchParams.get('page') || '1'));
    const limit = Math.min(50, Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') || '20')));
    const sort = (request.nextUrl.searchParams.get('sort') || 'newest') as MarketplaceSort;

    const where: Record<string, unknown> = { status: 'published', isActive: true };
    if (type && VALID_TYPES.includes(type)) where.type = type;
    if (search) where.name = { contains: search, mode: 'insensitive' };

    let orderBy: Record<string, 'asc' | 'desc'> = { createdAt: 'desc' };
    if (sort === 'popular') orderBy = { reviewCount: 'desc' };
    else if (sort === 'rating') orderBy = { rating: 'desc' };
    else if (sort === 'trust') orderBy = { trustScore: 'desc' };

    const [listings, total] = await Promise.all([
      db.marketplaceListing.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: { select: { purchases: true } },
          user: { select: { name: true, avatar: true } },
        },
      }),
      db.marketplaceListing.count({ where }),
    ]);

    const enriched = listings.map(l => ({
      ...l,
      badges: JSON.parse(l.badges || '[]'),
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
      const agent = await db.agent.findUnique({ where: { id: agentId }, select: { userId: true } });
      if (!agent || agent.userId !== auth.userId) return NextResponse.json({ error: 'Agent introuvable' }, { status: 403 });
    }

    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);

    const listing = await db.marketplaceListing.create({
      data: {
        name: name.trim(), slug, description,
        type: listingType, price: priceNum,
        userId: auth.userId, agentId: agentId || null,
        config: config ? JSON.stringify(config) : '{}',
        status: 'published',
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
