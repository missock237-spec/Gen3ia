import { NextRequest, NextResponse } from "next/server";
import { audioGenerator } from "@/lib/audio-generator";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, text, model, speed } = body;
    if (!userId || !text) return NextResponse.json({ error: "Champs requis: userId, text" }, { status: 400 });
    const result = await audioGenerator.generate({ userId, text, model, speed });
    if (!result.success) return NextResponse.json({ error: result.error }, { status: result.error?.includes("Credits") ? 402 : 502 });
    return NextResponse.json({ success: true, audioUrl: result.audioUrl, generationId: result.generationId, cost: result.cost });
  } catch (error) {
    logger.error("audio_generate_route_error", { error: String(error) });
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}