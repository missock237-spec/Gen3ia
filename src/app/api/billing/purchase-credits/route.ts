import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import Stripe from 'stripe';

const CREDIT_PACKS = [
  { id: 'credits_1000', credits: 1000, price: 5, label: '1 000 credits', priceLabel: '5€' },
  { id: 'credits_5000', credits: 5000, price: 20, label: '5 000 credits', priceLabel: '20€' },
  { id: 'credits_25000', credits: 25000, price: 80, label: '25 000 credits', priceLabel: '80€' },
  { id: 'credits_100000', credits: 100000, price: 250, label: '100 000 credits', priceLabel: '250€' },
];

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY non configure');
  return new Stripe(key, { apiVersion: '2025-02-24.acacia' });
}

export async function GET() {
  return NextResponse.json({ packs: CREDIT_PACKS });
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const { packId, successUrl, cancelUrl } = await request.json();

    const pack = CREDIT_PACKS.find(p => p.id === packId);
    if (!pack) {
      return NextResponse.json({ error: 'Pack invalide' }, { status: 400 });
    }

    const stripe = getStripe();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const checkout = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card', 'mobilepay', 'bancontact'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: pack.label + ' - Genova AI',
            description: 'Credits pour utiliser les agents IA et les services connectes',
          },
          unit_amount: pack.price * 100,
        },
        quantity: 1,
      }],
      metadata: {
        userId: session.userId,
        credits: String(pack.credits),
        packId: pack.id,
      },
      success_url: successUrl || baseUrl + '/billing?success=credits_purchased',
      cancel_url: cancelUrl || baseUrl + '/billing?canceled=true',
    });

    return NextResponse.json({ url: checkout.url, sessionId: checkout.id });
  } catch (error) {
    console.error('Purchase credits error:', error);
    return NextResponse.json({ error: 'Erreur paiement' }, { status: 500 });
  }
}
