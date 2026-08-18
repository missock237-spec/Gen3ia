import { NextRequest, NextResponse } from "next/server";
import { createSTTEngine } from "@/lib/voice";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { audio, language } = body;

    if (!audio) {
      return NextResponse.json({ error: "Audio is required" }, { status: 400 });
    }

    const stt = createSTTEngine("anonymous");
    const result = await stt.transcribe(audio, {
      language: language ?? "fr",
    });

    return NextResponse.json({
      text: result.text,
      confidence: result.confidence,
      duration: result.duration,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Speech recognition failed";
    logger.error("stt_error", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}