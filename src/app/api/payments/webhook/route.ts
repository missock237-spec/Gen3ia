// ============================================================
// POST /api/payments/webhook — Webhook SebPay
// ============================================================
import { NextRequest, NextResponse } from "next/server";
import { sebpay } from "@/lib/sebpay";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const signature = request.headers.get("x-sebpay-signature") ?? "";

    const isValid = sebpay.verifyWebhookSignature(JSON.stringify(payload), signature);
    if (!isValid) {
      logger.warn("sebpay_webhook_invalid_signature");
      return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
    }

    await sebpay.handleWebhook(payload);
    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error("sebpay_webhook_error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ received: false }, { status: 500 });
  }
}