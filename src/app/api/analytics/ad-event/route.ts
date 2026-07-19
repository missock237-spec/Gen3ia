import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { adId, type, timestamp, plan } = body;

    console.log(`[AdEvent] ${type.toUpperCase()} - Ad:${adId} - Plan:${plan} - ${timestamp}`);

    // Pour les utilisateurs payants, ajouter une récompense
    if (plan !== 'free' && (type === 'view' || type === 'click')) {
      // Ici: ajouter logique crédit récompense (à connecter à la DB)
      console.log(`[AdReward] +1 crédit pour ad view sur plan ${plan}`);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }
}
