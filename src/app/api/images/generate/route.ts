// ============================================================
// POST /api/images/generate — Generer une image via Hugging Face
// GET /api/images/generate — Historique des images
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { imageGenerator } from "@/lib/image-generator";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, prompt, model, negativePrompt, width, height } = body;

    if (!userId || !prompt) {
      return NextResponse.json({ error: "Champs requis: userId, prompt" }, { status: 400 });
    }

    const result = await imageGenerator.generate({ userId, prompt, model, negativePrompt, width, height });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.error?.includes("Credits") ? 402 : 502 });
    }

    return NextResponse.json({
      success: true,
      imageUrl: result.imageUrl,
      generationId: result.generationId,
      cost: result.cost,
    });
  } catch (error) {
    logger.error("image_generate_route_error", { error: String(error) });
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  const page = parseInt(request.nextUrl.searchParams.get("page") ?? "1");
  const limit = parseInt(request.nextUrl.searchParams.get("limit") ?? "20");

  if (!userId) return NextResponse.json({ error: "Parametre requis: userId" }, { status: 400 });

  const history = await imageGenerator.getHistory(userId, page, limit);
  return NextResponse.json(history);
}