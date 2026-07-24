import { NextRequest, NextResponse } from 'next/server';
export async function GET(r: NextRequest) {
  const mode = r.nextUrl.searchParams.get('hub.mode');
  const token = r.nextUrl.searchParams.get('hub.verify_token');
  const challenge = r.nextUrl.searchParams.get('hub.challenge');
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) return new NextResponse(challenge, { status: 200 });
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
export async function POST(r: NextRequest) {
  try {
    const b = await r.json();
    console.log('WhatsApp:', JSON.stringify(b).slice(0, 500));
    return NextResponse.json({ success: true });
  } catch { return NextResponse.json({ error: 'Erreur' }, { status: 500 }); }
}
