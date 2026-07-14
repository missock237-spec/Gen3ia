/**
 * Genova MCP Server API Route
 *
 * Point d'entrée pour la connexion MCP (Model Context Protocol).
 * Permet à Cursor, Claude Desktop, Windsurf de se connecter à Genova.
 *
 * GET  /api/mcp → Liste les infos du serveur MCP (découverte)
 * POST /api/mcp → Requête JSON-RPC MCP
 */

import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { handleMCPRequest, getTools, getResources, getPrompts, generateMCPConfig, generateCursorConfig } from '@/lib/mcp/genova-mcp-server';

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
      'Access-Control-Max-Age': '86400',
    },
  });
}

/**
 * GET /api/mcp
 * Retourne les informations de découverte du serveur MCP
 */
export async function GET(request: NextRequest) {
  const { auth, error } = await applySecurity(request, {
    requireAuth: true,
    rateLimit: { limit: 30, windowMs: 60000 },
  });

  if (error) return error;
  if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format');

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${request.nextUrl.protocol}//${request.nextUrl.host}`;

  // Format "config" → fichier de configuration pour les clients MCP
  if (format === 'config') {
    const config = generateMCPConfig(baseUrl, '');
    return NextResponse.json(config);
  }

  // Format "cursor" → config pour Cursor IDE
  if (format === 'cursor') {
    const config = generateCursorConfig('');
    return NextResponse.json({
      configuration: config,
      instructions: 'Ajoutez cette configuration dans les paramètres MCP de Cursor.',
    });
  }

  // Par défaut : infos de découverte
  return NextResponse.json({
    server: {
      name: 'Genova MCP Server',
      version: '1.0.0',
      protocol: '2025-03-26',
      description: 'Serveur MCP pour Genova AI Agent Operating System',
    },
    endpoints: {
      jsonrpc: `${baseUrl}/api/mcp`,
      sse: `${baseUrl}/api/mcp/sse`,
    },
    tools: getTools().map((t) => ({ name: t.name, description: t.description })),
    resources: getResources().map((r) => ({ uri: r.uri, name: r.name })),
    prompts: getPrompts().map((p) => ({ name: p.name, description: p.description })),
    authentication: {
      type: 'api-key',
      header: 'Authorization: Bearer <votre_clé_api>',
      hint: 'Générez une clé API depuis Genova > Paramètres > Clés API',
    },
  });
}

/**
 * POST /api/mcp
 * Point d'entrée JSON-RPC pour les requêtes MCP
 */
export async function POST(request: NextRequest) {
  // On autorise l'authentification via API Key (pour les clients MCP externes)
  // ou via session (pour les utilisateurs connectés sur le web)
  let userId: string | null = null;

  // 1. Essayer l'authentification par session (cookie)
  const { auth, error: authError } = await applySecurity(request, {
    requireAuth: false,
    rateLimit: { limit: 60, windowMs: 60000 },
  });

  if (auth?.userId) {
    userId = auth.userId;
  } else {
    // 2. Essayer l'authentification par API Key (Authorization: Bearer gva_...)
    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || '';
    if (authHeader.startsWith('Bearer gva_')) {
      try {
        const { verifyApiKey } = await import('@/lib/api-keys');
        const result = await verifyApiKey(authHeader);
        if (result.valid && result.userId) {
          userId = result.userId;
        }
      } catch {
        // Échec de vérification
      }
    }
  }

  if (!userId) {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32001,
          message: 'Authentification requise. Utilisez un cookie de session ou Authorization: Bearer gva_...',
        },
      },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();

    // Valider que c'est bien une requête JSON-RPC
    if (!body || body.jsonrpc !== '2.0') {
      return NextResponse.json(
        {
          jsonrpc: '2.0',
          id: body?.id ?? null,
          error: { code: -32600, message: 'Requête JSON-RPC 2.0 invalide' },
        },
        { status: 400 }
      );
    }

    const result = await handleMCPRequest(body, userId);

    return NextResponse.json(result, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Erreur de parsing JSON' },
      },
      { status: 400 }
    );
  }
}
