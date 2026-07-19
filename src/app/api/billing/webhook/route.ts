import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const signature = request.headers.get("x-sebpay-signature") || "";

    const { status, transaction_id, reference, amount, phone } = body;

    if (status === "success") {
      console.log(`✅ Paiement SebPay réussi: ${transaction_id} - ${reference} - ${amount}XAF`);
    } else if (status === "failed") {
      console.log(`❌ Paiement SebPay échoué: ${transaction_id} - ${reference}`);
    }

    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: "Invalid webhook" }, { status: 400 });
  }
}
