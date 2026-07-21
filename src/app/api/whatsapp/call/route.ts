// ============================================================
// POST /api/whatsapp/call — Passer un appel audio WhatsApp
// ============================================================
// Utilise le VoiceProfile de l'utilisateur pour la synthèse vocale
// Supporte : OpenAI TTS (alloy, echo, fable, onyx, nova, shimmer)
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { whatsappService } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { to, userId, message } = body;

    if (!to || !userId || !message) {
      return NextResponse.json({ error: "Champs requis: to, userId, message" }, { status: 400 });
    }

    const result = await whatsappService.makeCall({ to, userId, message });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    return NextResponse.json({ success: true, callSid: result.callSid });
  } catch (error) {
    logger.error("whatsapp_call_api_error", { error: String(error) });
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}