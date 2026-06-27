import { NextRequest, NextResponse } from 'next/server';
import { applySecurity, secureResponse } from '@/lib/security';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { auth, error: secError } = await applySecurity(request, { requireAuth: true });
  if (secError || !auth) return secError || NextResponse.json({ error: 'Auth required' }, { status: 401 });

  try {
    const profile = await db.sellerProfile.findUnique({
      where: { userId: auth.userId },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { listing: { select: { name: true } }, buyer: { select: { name: true, email: true } } }
        },
        analytics: {
          orderBy: { date: 'desc' },
          take: 30
        }
      }
    });

    if (!profile) {
      return secureResponse(NextResponse.json({ error: 'Seller profile not found' }, { status: 404 }), request);
    }

    // Calculate aggregate stats
    const totalRevenue = await db.marketplaceTransaction.aggregate({
      where: { sellerId: profile.id, status: 'completed' },
      _sum: { amount: true, sellerAmount: true, platformFee: true }
    });

    const totalSales = await db.marketplaceTransaction.count({
      where: { sellerId: profile.id, status: 'completed' }
    });

    return secureResponse(NextResponse.json({
      profile,
      stats: {
        totalRevenue: totalRevenue._sum.amount || 0,
        sellerEarnings: totalRevenue._sum.sellerAmount || 0,
        platformFees: totalRevenue._sum.platformFee || 0,
        totalSales
      }
    }), request);
  } catch (err: any) {
    return secureResponse(NextResponse.json({ error: err.message }, { status: 500 }), request);
  }
}
