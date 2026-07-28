import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verify } from 'jsonwebtoken';

const JWT_SECRET = process.env.AUTH_SECRET;

const PLAN_PRICES: Record<string, number> = {
  free: 0,
  starter: 5000,
  pro: 15000,
  enterprise: 50000,
};

const CREDIT_PACKS: Record<string, { credits: number; price: number }> = {
  small: { credits: 500, price: 2500 },
  medium: { credits: 2000, price: 8000 },
  large: { credits: 5000, price: 18000 },
  xlarge: { credits: 15000, price: 45000 },
};

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ') || !JWT_SECRET || JWT_SECRET.length < 32) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const decoded = verify(token, JWT_SECRET) as { userId: string };

    const { type, id } = await request.json();

    if (!type || !id) {
      return NextResponse.json({ error: 'Type et ID requis' }, { status: 400 });
    }

    if (type === 'plan') {
      const price = PLAN_PRICES[id];
      if (price === undefined) {
        return NextResponse.json({ error: 'Plan invalide' }, { status: 400 });
      }
      if (price === 0) {
        // Plan gratuit - activation directe
        await db.user.update({
          where: { id: decoded.userId },
          data: { plan: id },
        });
        return NextResponse.json({ success: true, message: `Plan ${id} activé` });
      }

      // Redirection vers la page de paiement (Stripe, SebPay, etc.)
      // Actuellement, on simule avec une redirection vers /billing
      return NextResponse.json({
        url: `/billing?checkout=plan_${id}`,
        success: true,
        message: `Redirection vers le paiement du plan ${id} (${price} FCFA/mois)`,
      });
    }

    if (type === 'credits') {
      const pack = CREDIT_PACKS[id];
      if (!pack) {
        return NextResponse.json({ error: 'Pack de crédits invalide' }, { status: 400 });
      }

      // Créer une transaction en attente
      const transaction = await db.creditTransaction.create({
        data: {
          userId: decoded.userId,
          type: 'credit',
          amount: pack.credits,
          description: `Achat pack ${pack.credits} crédits (${pack.price} FCFA)`,
        },
      });

      return NextResponse.json({
        url: `/billing?checkout=credits_${id}`,
        success: true,
        transactionId: transaction.id,
        message: `Redirection vers le paiement de ${pack.credits} crédits (${pack.price} FCFA)`,
      });
    }

    return NextResponse.json({ error: 'Type de transaction invalide' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Erreur de paiement' }, { status: 500 });
  }
}
