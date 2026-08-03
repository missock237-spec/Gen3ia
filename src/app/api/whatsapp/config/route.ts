import { NextRequest, NextResponse } from 'next/server';

// WhatsApp a été retiré du projet Gen3ia.
// Route neutralisée : plus aucun accès au modèle WhatsAppConfig (supprimé du schéma Prisma).

export const dynamic = "force-dynamic";

export async function OPTIONS(_request: NextRequest) {
  return new NextResponse(null, { status: 204 });
}

export async function GET() {
  return NextResponse.json({ error: 'WhatsApp has been removed from Gen3ia' }, { status: 410 });
}

export async function POST() {
  return NextResponse.json({ error: 'WhatsApp has been removed from Gen3ia' }, { status: 410 });
}

export async function PUT() {
  return NextResponse.json({ error: 'WhatsApp has been removed from Gen3ia' }, { status: 410 });
}

export async function DELETE() {
  return NextResponse.json({ error: 'WhatsApp has been removed from Gen3ia' }, { status: 410 });
}
