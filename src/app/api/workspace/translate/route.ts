import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { africanTranslator } from '@/lib/workspace-tools/translator';

export const maxDuration = 10;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { text, from, to, auto } = await request.json();
    if (!text || !to) {
      return NextResponse.json({ error: 'Texte et langue cible requis' }, { status: 400 });
    }

    let result;
    if (auto || !from) {
      result = africanTranslator.autoTranslate(text, to);
      return NextResponse.json({
        success: true,
        translated: result.translated,
        detectedFrom: result.detectedFrom,
        to: result.to,
        matches: result.matches,
        timestamp: new Date().toISOString(),
      });
    } else {
      result = africanTranslator.translate(text, from, to);
      return NextResponse.json({
        success: true,
        translated: result.translated,
        from: result.source,
        to,
        matches: result.matches,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Erreur: ' + (error instanceof Error ? error.message : 'Inconnue'),
    }, { status: 500 });
  }
}

// GET — liste les langues supportées
export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const url = new URL(request.url);
  if (url.searchParams.get('scope') === 'languages') {
    return NextResponse.json({ success: true, languages: africanTranslator.listLanguages() });
  }

  if (url.searchParams.get('scope') === 'phrases') {
    return NextResponse.json({ success: true, phrases: africanTranslator.getCommonPhrases() });
  }

  return NextResponse.json({ success: true, languages: africanTranslator.listLanguages() });
}
