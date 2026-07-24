import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // Invalidation côté client via localStorage
  // En production: ajouter le token à une blacklist Redis
  return NextResponse.json({ success: true });
}
