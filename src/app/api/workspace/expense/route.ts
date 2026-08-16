import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { expenseTracker } from '@/lib/workspace-tools/expense-tracker';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  const { action, data } = await request.json();
  switch (action) {
    case 'add': return NextResponse.json({ success: true, expense: expenseTracker.add(data) });
    case 'update': return NextResponse.json({ success: true, expense: expenseTracker.update(data.id, data) });
    case 'delete': return NextResponse.json({ success: true, deleted: expenseTracker.delete(data.id) });
    case 'budget': return NextResponse.json({ success: true, budget: expenseTracker.budgetCheck(data.budget, data.currency) });
    default: return NextResponse.json({ error: 'Action invalide' }, { status: 400 });
  }
}

export async function GET(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user.id) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  const url = new URL(request.url);
  const scope = url.searchParams.get('scope') || 'summary';
  if (scope === 'summary') return NextResponse.json({ success: true, summary: expenseTracker.getSummary(url.searchParams.get('currency') || 'XOF', parseInt(url.searchParams.get('days') || '30')) });
  if (scope === 'list') return NextResponse.json({ success: true, expenses: expenseTracker.list(url.searchParams.get('category') || undefined) });
  return NextResponse.json({ success: true, summary: expenseTracker.getSummary() });
}
