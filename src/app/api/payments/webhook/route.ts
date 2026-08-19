// ============================================================
// POST /api/payments/webhook — Webhook Chariow
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { chariow } from "@/lib/payment/chariow";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    const payload = JSON.parse(raw);
    const signature = request.headers.get("x-chariow-signature") ?? request.headers.get("x-signature") ?? "";

    const isValid = chariow.verifyWebhookSignature(raw, signature);
    if (!isValid) {
      logger.warn("chariow_webhook_invalid_signature");
      return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
    }

    await chariow.handleWebhook(payload);
    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error("chariow_webhook_error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ received: false }, { status: 500 });
  }
}