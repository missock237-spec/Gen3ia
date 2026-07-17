import { NextResponse } from 'next/server';
import { getFeatures, getActiveFeatures } from '@/lib/config/features';
export async function GET() {
  const features = getFeatures();
  const active = getActiveFeatures();
  return NextResponse.json({
    stats: { total: features.length, active: active.length, inactive: features.length - active.length },
    features: features.map(f => ({ key: f.key, name: f.name, active: f.active })),
    timestamp: new Date().toISOString(),
  });
}