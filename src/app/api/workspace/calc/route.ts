import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { businessCalculators } from '@/lib/workspace-tools/business-calculators';

export const maxDuration = 10;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { operation, params } = await request.json();
    if (!operation) {
      return NextResponse.json({ error: 'Opération requise' }, { status: 400 });
    }

    let result: unknown;

    switch (operation) {
      case 'currency-convert':
        result = businessCalculators.convertCurrency(params.amount, params.from, params.to);
        break;
      case 'profit-margin':
        result = businessCalculators.profitMargin(params.revenue, params.cost);
        break;
      case 'loan-payment':
        result = businessCalculators.loanPayment(params.principal, params.annualRate, params.months);
        break;
      case 'break-even':
        result = businessCalculators.breakEven(params.fixedCosts, params.pricePerUnit, params.variableCostPerUnit);
        break;
      case 'vat':
        result = businessCalculators.vatCalculation(params.amountHT, params.country);
        break;
      case 'roi':
        result = businessCalculators.calculateROI(params.investment, params.gain, params.periodMonths);
        break;
      case 'optimal-price':
        result = businessCalculators.optimalPrice(params.cost, params.targetMargin, params.vatCountry);
        break;
      case 'list-currencies':
        result = businessCalculators.listCurrencies();
        break;
      default:
        return NextResponse.json({ error: `Opération "${operation}" non supportée` }, { status: 400 });
    }

    return NextResponse.json({ success: true, operation, result, timestamp: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({
      success: false, error: 'Erreur: ' + (error instanceof Error ? error.message : 'Inconnue'),
    }, { status: 500 });
  }
}
