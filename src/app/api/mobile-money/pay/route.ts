import { NextRequest, NextResponse } from 'next/server';
import { isFeatureActive } from '@/lib/config/features';
import { MobileMoneyManager } from '@/lib/payments/african-mobile-money';

export async function POST(request: NextRequest) {
  if (!isFeatureActive('mobile_money')) {
    return NextResponse.json(
      { error: 'Paiements Mobile Money indisponibles', message: 'Configurez MOBILE_MONEY_API_KEY dans les variables d environnement pour activer cette fonctionnalite' },
      { status: 503 }
    );
  }
  try {
    const body = await request.json();
    const manager = new MobileMoneyManager();
    const result = await manager.initiatePayment(body);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erreur lors du paiement';
    return NextResponse.json({ success: false, message: msg }, { status: 500 });
  }
}