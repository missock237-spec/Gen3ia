import { NextRequest, NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ error: 'Marketplace supprime du projet' }, { status: 404 });
}