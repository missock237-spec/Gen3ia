// ============================================================
// Marketplace API — Listing, achat et vente d'agents
// GET: lister les annonces publiques
// POST: creer une annonce (auth requis)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { applySecurity, secureResponse } from '@/lib/security';

const log = createLogger('marketplace');

const VALID_TYPES = ['agent', 'tool', 'workflow', 'template', 'prompt', 'integration'];
const MAX_NAME_LENGTH = 100;
const MAX_DESC_LENGTH = 2000;

export async function GET(request: NextRequest) {
  try {
    const type = request.nextUrl.searchParams.get('type');
    const search = request.nextUrl.searchParams.get('search');
    const page = Math.max(1, parseInt(request.nextUrl.searchParams.get('page') || '1'));
    const limit = Math.min(50, Math.max(1, parseInt(request.nextUrl.searchParams.get('limit') || '20')));

    const where: Record<string, unknown> = { status: 'published', isActive: true };
    if (type && VALID_TYPES.includes(type)) where.type = type;
    if (search) where.name = { contains: search, mode: 'insensitive' };

    const [listings, total] = await Promise.all([
      db.marketplaceListing.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: { select: { purchases: true } },
          user: { select: { name: true, avatar: true } },
        },
      }),
      db.marketplaceListing.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: listings,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    log.error('marketplace_list_error', { error: String(error) });
    return NextResponse.json({ error: 'Erreur de chargement' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const body = await request.json();
    const { name, description, type, price, agentId, config } = body;

    if (!name || typeof name !== 'string' || name.trim().length < 3) {
      return NextResponse.json({ error: 'Nom requis (min 3 caracteres)' }, { status: 400 });
    }
    if (name.length > MAX_NAME_LENGTH) {
      return NextResponse.json({ error: `Nom trop long (max ${MAX_NAME_LENGTH})` }, { status: 400 });
    }
    if (!description || description.length < 10) {
      return NextResponse.json({ error: 'Description requise (min 10 caracteres)' }, { status: 400 });
    }
    if (description.length > MAX_DESC_LENGTH) {
      return NextResponse.json({ error: `Description trop longue (max ${MAX_DESC_LENGTH})` }, { status: 400 });
    }

    const listingType = type && VALID_TYPES.includes(type) ? type : 'agent';
    const priceNum = Math.max(0, Number(price) || 0);

    // Verifier que l'agent appartient a l'utilisateur
    if (agentId && listingType === 'agent') {
      const agent = await db.agent.findUnique({ where: { id: agentId }, select: { userId: true } });
      if (!agent || agent.userId !== auth.userId) {
        return NextResponse.json({ error: 'Agent introuvable ou acces refuse' }, { status: 403 });
      }
    }

    const slug = name.trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') + '-' + Date.now().toString(36);

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
      },
    });

    log.info('marketplace_listing_created', {
      id: listing.id,
      name: listing.name,
      type: listingType,
      price: priceNum,
    });

    return NextResponse.json({ success: true, data: listing }, { status: 201 });
  } catch (error) {
    log.error('marketplace_create_error', { error: String(error) });
    return NextResponse.json({ error: 'Erreur de creation' }, { status: 500 });
  }
}
