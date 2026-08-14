// POST /api/audio/generate — Génère de l'audio TTS (coûteux, nécessite quota)
// SECURITE: withAuth() + verification IDOR (userId du token, pas du body) + quota + rate limit

import { NextRequest, NextResponse } from "next/server";
import { audioGenerator } from "@/lib/audio-generator";
import { logger } from "@/lib/logger";
import { withAuth, type RouteParams } from "@/lib/with-auth";





export const dynamic = "force-dynamic";
export const POST = withAuth(async (request: NextRequest, ctx: { params?: RouteParams }, auth) => {
  try {
    const body = await request.json();
    // SECURITY: userId vient du token authentifié, JAMAIS du body client (previent l'IDOR)
    const { text, model, speed } = body;

    if (!text) {
      return NextResponse.json({ error: "Champ requis: text" }, { status: 400 });
    }

    // Utiliser auth.userId (du token securise) — ne jamais faire confiance au body
// @ts-ignore
    const result = await audioGenerator.generate({ userId: auth.userId, text, model, speed });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error?.includes("Credits") ? 402 : 502 }
      );
    }

    return NextResponse.json({
      success: true,
      audioUrl: result.audioUrl,
      generationId: result.generationId,
      cost: result.cost,
    });
  } catch (error) {
    logger.error("audio_generate_route_error", { error: String(error) });
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}, {
  requireAuth: true,
  roles: ['user'],
  rateLimit: { limit: 10, windowMs: 60000 }, // 10 generations audio/min max
  quota: true, // L'audio consomme des credits → verifier le quota
});
