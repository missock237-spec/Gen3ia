import { NextRequest, NextResponse } from 'next/server';

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return NextResponse.json({ received: true });
}
