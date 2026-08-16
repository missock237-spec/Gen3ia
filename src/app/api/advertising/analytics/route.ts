import { NextRequest, NextResponse } from 'next/server';
import { adAnalytics } from '@/lib/advertising/ad-analytics';

export async function GET(req: NextRequest) {
  try {
    const type = req.nextUrl.searchParams.get('type');
    const dateRange = (req.nextUrl.searchParams.get('range') as 'today' | 'week' | 'month') || 'week';

    switch (type) {
      case 'segments':
        const segments = await adAnalytics.analyzeUserSegments();
        return NextResponse.json({ success: true, data: segments });

      case 'fraud':
        const fraudAlerts = await adAnalytics.detectFraudPatterns();
        return NextResponse.json({ success: true, data: fraudAlerts, count: fraudAlerts.length });

      case 'report':
        const report = await adAnalytics.generatePerformanceReport(dateRange === 'today' ? 1 : dateRange === 'week' ? 7 : 30);
        return NextResponse.json({ success: true, data: report });

      case 'timing':
        const timings = await adAnalytics.predictOptimalAdTiming();
        return NextResponse.json({ success: true, data: timings });

      case 'roi':
        const campaignId = req.nextUrl.searchParams.get('campaignId');
        if (!campaignId) return NextResponse.json({ error: 'campaignId required' }, { status: 400 });
        const roi = await adAnalytics.calculateCampaignROI(campaignId);
        return NextResponse.json({ success: true, data: roi });

      default:
        return NextResponse.json({ error: 'Unknown analytics type' }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
