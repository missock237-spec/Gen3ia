// POST /api/code/generate - Generation automatique de code par IA
import { NextRequest, NextResponse } from 'next/server';
import { generateCode } from '@/lib/code-engine/generator';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, language, type, context } = body;

    if (!prompt) {
      return NextResponse.json({ error: 'prompt requis' }, { status: 400 });
    }

    const result = await generateCode({
      prompt,
      language: language || 'javascript',
      type: type || 'script',
      context,
    });

    return NextResponse.json({
      success: true,
      code: result.code,
      explanation: result.explanation,
      language: result.language,
      type: result.type,
      tokens: result.tokens,
      duration: result.duration + 'ms',
      suggestions: result.suggestions,
    });
  } catch (error: unknown) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur lors de la generation',
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    name: 'Code Generator AI',
    description: 'Genere automatiquement du code a partir d\'une description en langage naturel',
    usage: 'POST /api/code/generate avec { prompt, language?, type? }',
    languages: ['javascript', 'typescript', 'python', 'html'],
    types: ['api', 'component', 'pipeline', 'function', 'test', 'script'],
    examples: [
      { prompt: 'Cree une API REST pour gerer des utilisateurs', type: 'api' },
      { prompt: 'Cree un formulaire de connexion', type: 'component' },
      { prompt: 'Teste la fonction validateEmail', type: 'test' },
    ],
  });
}