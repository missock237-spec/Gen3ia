// ============================================================
// POST /api/videos/generate — Generer une video via Hugging Face
// GET /api/videos/generate — Historique des videos
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { videoGenerator } from "@/lib/video-generator";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, prompt, model, negativePrompt, numFrames, width, height } = body;
    if (!userId || !prompt) {
      return NextResponse.json({ error: "Champs requis: userId, prompt" }, { status: 400 });
    }
    const result = await videoGenerator.generate({ userId, prompt, model, negativePrompt, numFrames, width, height });
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.error?.includes("Credits") ? 402 : 502 });
    }
    return NextResponse.json({ success: true, videoUrl: result.videoUrl, generationId: result.generationId, cost: result.cost });
  } catch (error) {
    logger.error("video_generate_route_error", { error: String(error) });
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  const page = parseInt(request.nextUrl.searchParams.get("page") ?? "1");
  const limit = parseInt(request.nextUrl.searchParams.get("limit") ?? "20");
  if (!userId) return NextResponse.json({ error: "Parametre requis: userId" }, { status: 400 });
  const history = await videoGenerator.getHistory(userId, page, limit);
  return NextResponse.json(history);
}