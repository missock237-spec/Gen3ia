import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ error: 'Marketplace supprime du projet' }, { status: 404 });
}