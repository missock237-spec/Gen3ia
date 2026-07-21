// ============================================================
// POST /api/whatsapp/send — Envoyer un message WhatsApp
// ============================================================
// Supporte : texte, image, vidéo, audio, document, template
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { whatsappService } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { to, type, text, mediaUrl, caption, filename, templateName, templateParams } = body;

    if (!to) {
      return NextResponse.json({ error: "Le champ 'to' est requis" }, { status: 400 });
    }

    let result;

    switch (type) {
      case "text":
        if (!text) return NextResponse.json({ error: "Le champ 'text' est requis" }, { status: 400 });
        result = await whatsappService.sendText(to, text);
        break;

      case "image":
      case "video":
      case "audio":
      case "document":
        if (!mediaUrl) return NextResponse.json({ error: "Le champ 'mediaUrl' est requis" }, { status: 400 });
        result = await whatsappService.sendMedia({ to, type, mediaUrl, caption, filename });
        break;

      case "template":
        if (!templateName) return NextResponse.json({ error: "Le champ 'templateName' est requis" }, { status: 400 });
        result = await whatsappService.sendTemplate({ to, templateName, language: body.language, parameters: templateParams });
        break;

      default:
        return NextResponse.json({
          error: "Type invalide. Types supportés: text, image, video, audio, document, template",
        }, { status: 400 });
    }

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    return NextResponse.json({ success: true, messageId: result.messageId });
  } catch (error) {
    logger.error("whatsapp_send_error", { error: String(error) });
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}