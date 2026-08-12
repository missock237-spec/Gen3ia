// ============================================================
// API admin - gestion des partenaires de recommandation
// GET  /api/admin/partners          -> liste des partenaires + stats
// POST /api/admin/partners          -> création d'un partenaire
// PATCH /api/admin/partners         -> activation / suspension
// (admin uniquement)
//
// COMPATIBILITÉ FAÇADE FIRESTORE (migration Prisma -> Firestore)
//  - `db` provient de '@/lib/db'.
//  - `where` en FirestoreWhereOp[], `select` en string[].
//  - `orderBy` non géré par la façade : tri effectué en JS après lecture.
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generatePartnerApiKey } from '@/lib/recommend';
import { applySecurity } from '@/lib/security';

export const dynamic = 'force-dynamic';

/** Authentifie un admin et retourne une réponse d'erreur sinon. */
async function requireAdmin(request: NextRequest) {
  const sec = await applySecurity(request, { requireAuth: true, roles: ['admin'] });
  if (sec.error) return sec.error; // 401 / 403 / 500
  if (!sec.auth) {
    return NextResponse.json({ error: 'Authentification requise' }, { status: 401 });
  }
  return sec.auth;
}

// Champs listés côté admin (stats incluses)
const PARTNER_ADMIN_SELECT = [
  'id',
  'name',
  'type',
  'referralCode',
  'website',
  'description',
  'allowedOrigins',
  'status',
  'views',
  'clicks',
  'signups',
  'conversions',
  'ownerId',
  'createdAt',
  'updatedAt',
] as const;

function asSortedPartnerList(list: unknown[]): unknown[] {
  return [...list].sort((a, b) => {
    const ta = (a as Record<string, unknown>)?.createdAt;
    const tb = (b as Record<string, unknown>)?.createdAt;
    const na =
      typeof ta === 'string' || typeof ta === 'number'
        ? new Date(ta).getTime()
        : (ta as { toMillis?: () => number })?.toMillis?.() ?? 0;
    const nb =
      typeof tb === 'string' || typeof tb === 'number'
        ? new Date(tb).getTime()
        : (tb as { toMillis?: () => number })?.toMillis?.() ?? 0;
    return nb - na; // plus récent en premier
  });
}

// GET : liste des partenaires (triées créées-desc)
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const partners = await db.partner.findMany({
    select: [...PARTNER_ADMIN_SELECT],
  });

  return NextResponse.json({ partners: asSortedPartnerList(partners) });
}

// POST : création d'un partenaire
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ error: 'Le champ name est requis' }, { status: 400 });
  }

  const type =
    typeof body.type === 'string' && ['ai', 'browser', 'extension', 'website'].includes(body.type)
      ? body.type
      : 'ai';

  const partner = await db.partner.create({
    data: {
      name,
      type,
      apiKey: generatePartnerApiKey(),
      referralCode: typeof body.referralCode === 'string' ? body.referralCode : null,
      website: typeof body.website === 'string' ? body.website : null,
      description: typeof body.description === 'string' ? body.description : null,
      allowedOrigins: typeof body.allowedOrigins === 'string' ? body.allowedOrigins : '[]',
      status: body.status === 'suspended' ? 'suspended' : 'active',
      ownerId: admin.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  });

  return NextResponse.json(
    { partner: { id: partner?.id, name, type, status: partner?.status ?? 'active' } },
    { status: 201 },
  );
}

// PATCH : activation / suspension d'un partenaire
export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) {
    return NextResponse.json({ error: 'Le champ id est requis' }, { status: 400 });
  }

  const status = typeof body.status === 'string' ? body.status : undefined;
  if (status !== 'active' && status !== 'suspended') {
    return NextResponse.json(
      { error: "Le champ status doit être 'active' ou 'suspended'" },
      { status: 400 },
    );
  }

  const where = [{ field: 'id', op: '==' as const, value: id }];
  await db.partner.update({
    where,
    data: { status, updatedAt: new Date().toISOString() },
  });

  // Lecture post-update pour exposer un objet stable (id/name/status)
  const partner = await db.partner.findUnique({
    where,
    select: ['id', 'name', 'status', 'updatedAt'],
  });

  return NextResponse.json({ partner });
      }
