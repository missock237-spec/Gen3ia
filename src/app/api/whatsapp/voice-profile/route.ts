// ============================================================
// WhatsApp Voice Profile — Gestion de la voix pour les appels
// POST : Enregistrer ou mettre à jour le profil vocal
// GET  : Récupérer le profil vocal de l'utilisateur
// ============================================================
// Modèles vocaux OpenAI TTS supportés :
//   alloy, echo, fable, onyx, nova, shimmer
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { whatsappService } from "@/lib/whatsapp";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, voiceModel, speed, pitch, language } = body;

    if (!userId || !voiceModel) {
      return NextResponse.json({ error: "Champs requis: userId, voiceModel" }, { status: 400 });
    }

    const validModels = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
    if (!validModels.includes(voiceModel)) {
      return NextResponse.json({
        error: `Modèle vocal invalide. Modèles supportés: ${validModels.join(", ")}`,
      }, { status: 400 });
    }

    await whatsappService.saveVoiceProfile({
      userId,
      voiceModel,
      speed: speed ?? 1.0,
      pitch: pitch ?? 1.0,
      language: language ?? "fr-FR",
    });

    return NextResponse.json({ success: true, message: "Profil vocal enregistré" });
  } catch (error) {
    logger.error("whatsapp_voice_profile_error", { error: String(error) });
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "Paramètre requis: userId" }, { status: 400 });
  }

  const profile = await prisma.voiceProfile.findUnique({ where: { userId } });
  if (!profile) {
    return NextResponse.json({ profile: null, message: "Aucun profil vocal trouvé" });
  }

  return NextResponse.json({
    profile: {
      voiceModel: profile.voiceModel,
      speed: profile.speed,
      pitch: profile.pitch,
      language: profile.language,
      provider: profile.provider,
    },
  });
}