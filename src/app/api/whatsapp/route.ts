import { NextRequest, NextResponse } from 'next/server';

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'whatsapp' });
}

export async function POST(request: NextRequest) {
  return NextResponse.json({ error: 'Not implemented' }, { status: 501 });
}
