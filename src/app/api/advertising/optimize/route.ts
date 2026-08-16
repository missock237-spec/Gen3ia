import { NextRequest, NextResponse } from 'next/server';
import { adOptimizer } from '@/lib/advertising/ad-optimizer';

export async function POST(req: NextRequest) {
  try {
    const { action } = await req.json();

    switch (action) {
      case 'optimize_bids':
        const bids = await adOptimizer.optimizeBids();
        return NextResponse.json({ success: true, data: bids });

      case 'optimize_budget':
        const budget = await adOptimizer.optimizeBudgetAllocation();
        return NextResponse.json({ success: true, data: budget });

      case 'expand_audience':
        const { campaignId } = await req.json();
        if (!campaignId) return NextResponse.json({ error: 'campaignId required' }, { status: 400 });
        const expansion = await adOptimizer.expandTargetAudience(campaignId);
        return NextResponse.json({ success: true, data: expansion });

      case 'manage_ab_tests':
        const abTests = await adOptimizer.manageABTests();
        return NextResponse.json({ success: true, data: abTests });

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
