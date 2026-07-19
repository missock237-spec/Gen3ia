import { NextRequest, NextResponse } from "next/server";
import { initiatePayment, CREDIT_PACKAGES } from "@/lib/sebpay";

export async function GET() {
  const balance = 500;
  return NextResponse.json({
    balance,
    isUnlimited: false,
    packages: CREDIT_PACKAGES.map(p => ({
      ...p,
      pricePerCredit: parseFloat((p.price / p.credits).toFixed(4)),
    })),
    history: [],
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { packageId, phone, operator } = body;

    const pkg = CREDIT_PACKAGES.find(p => p.id === packageId);
    if (!pkg) {
      return NextResponse.json({ error: "Pack de crédits invalide" }, { status: 400 });
    }

    const reference = `GENOVA-CREDIT-${packageId}-${Date.now()}`;
    const payment = await initiatePayment({
      amount: pkg.price,
      currency: process.env.SEBPAY_DEFAULT_CURRENCY || "XAF",
      phone: phone || "",
      operator: operator || (process.env.SEBPAY_DEFAULT_OPERATOR as any) || "MTN",
      description: `${pkg.name} - ${pkg.credits} crédits Genova AI`,
      reference,
      callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/billing/webhook`,
    });

    return NextResponse.json({ payment, package: pkg, reference });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur d'achat" },
      { status: 500 }
    );
  }
}
