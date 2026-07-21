// ============================================================
// WhatsApp Webhook — Réception des messages Meta
// GET  : Vérification du webhook (Meta challenge)
// POST : Réception des messages entrants
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { whatsappService } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");

  const result = whatsappService.verifyWebhook(mode, token, challenge);
  if (result) {
    return new NextResponse(result);
  }
  return NextResponse.json({ error: "Invalid verification token" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    await whatsappService.handleIncomingMessage(payload);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("whatsapp_webhook_error", { error: String(error) });
    return NextResponse.json({ success: false }, { status: 200 });
  }
}