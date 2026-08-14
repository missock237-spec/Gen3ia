// ============================================================
// BUSINESS CALCULATORS — Suite de calculateurs business
// Conçu pour le marché africain: FCFA, NGN, GHS, devises locales
// ============================================================

export interface CurrencyRate {
  code: string;
  name: string;
  symbol: string;
  // Taux par rapport au FCFA (XOF)
  rateToXOF: number;
}

// Devises africaines + internationales courantes
export const AFRICAN_CURRENCIES: CurrencyRate[] = [
  { code: 'XOF', name: 'Franc CFA (Ouest)', symbol: 'FCFA', rateToXOF: 1 },
  { code: 'XAF', name: 'Franc CFA (Centre)', symbol: 'FCFA', rateToXOF: 1 },
  { code: 'NGN', name: 'Naira (Nigeria)', symbol: '₦', rateToXOF: 0.78 },
  { code: 'GHS', name: 'Cedi (Ghana)', symbol: 'GH₵', rateToXOF: 65.5 },
  { code: 'KES', name: 'Shilling (Kenya)', symbol: 'KSh', rateToXOF: 5.2 },
  { code: 'ZAR', name: 'Rand (Afrique du Sud)', symbol: 'R', rateToXOF: 33.8 },
  { code: 'MAD', name: 'Dirham (Maroc)', symbol: 'DH', rateToXOF: 100.8 },
  { code: 'TND', name: 'Dinar (Tunisie)', symbol: 'DT', rateToXOF: 334.5 },
  { code: 'EGP', name: 'Livre (Égypte)', symbol: 'E£', rateToXOF: 24.8 },
  { code: 'EUR', name: 'Euro', symbol: '€', rateToXOF: 655.957 },
  { code: 'USD', name: 'Dollar US', symbol: '$', rateToXOF: 605.5 },
  { code: 'GBP', name: 'Livre Sterling', symbol: '£', rateToXOF: 768.2 },
];

export class BusinessCalculators {
  /**
   * Conversion de devises
   */
  convertCurrency(amount: number, from: string, to: string): { result: number; from: string; to: string; rate: number } {
    const fromCurrency = AFRICAN_CURRENCIES.find(c => c.code === from);
    const toCurrency = AFRICAN_CURRENCIES.find(c => c.code === to);

    if (!fromCurrency) throw new Error(`Devise source "${from}" non supportée`);
    if (!toCurrency) throw new Error(`Devise cible "${to}" non supportée`);

    // Convert via XOF as base
    const inXOF = amount * fromCurrency.rateToXOF;
    const result = inXOF / toCurrency.rateToXOF;

    return {
      result: Math.round(result * 100) / 100,
      from,
      to,
      rate: Math.round((toCurrency.rateToXOF / fromCurrency.rateToXOF) * 10000) / 10000,
    };
  }

  /**
   * Calcul de marge bénéficiaire
   */
  profitMargin(revenue: number, cost: number): { margin: number; marginPercent: number; markup: number; markupPercent: number } {
    const margin = revenue - cost;
    const marginPercent = revenue > 0 ? (margin / revenue) * 100 : 0;
    const markup = cost > 0 ? (margin / cost) * 100 : 0;

    return {
      margin: Math.round(margin * 100) / 100,
      marginPercent: Math.round(marginPercent * 100) / 100,
      markup: Math.round(markup * 100) / 100,
      markupPercent: Math.round(markup * 100) / 100,
    };
  }

  /**
   * Calcul de prêt (mensualités)
   * Formule: M = P * [r(1+r)^n] / [(1+r)^n - 1]
   */
  loanPayment(principal: number, annualRate: number, months: number): {
    monthlyPayment: number;
    totalPaid: number;
    totalInterest: number;
    amortization: Array<{ month: number; payment: number; interest: number; principal: number; balance: number }>;
  } {
    const monthlyRate = annualRate / 100 / 12;
    
    let monthlyPayment: number;
    if (monthlyRate === 0) {
      monthlyPayment = principal / months;
    } else {
      monthlyPayment = principal * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
    }

    const totalPaid = monthlyPayment * months;
    const totalInterest = totalPaid - principal;

    // Tableau d'amortissement
    const amortization = [];
    let balance = principal;
    for (let m = 1; m <= Math.min(months, 12); m++) { // 12 premiers mois
      const interest = balance * monthlyRate;
      const principalPayment = monthlyPayment - interest;
      balance -= principalPayment;
      amortization.push({
        month: m,
        payment: Math.round(monthlyPayment * 100) / 100,
        interest: Math.round(interest * 100) / 100,
        principal: Math.round(principalPayment * 100) / 100,
        balance: Math.round(Math.max(0, balance) * 100) / 100,
      });
    }

    return {
      monthlyPayment: Math.round(monthlyPayment * 100) / 100,
      totalPaid: Math.round(totalPaid * 100) / 100,
      totalInterest: Math.round(totalInterest * 100) / 100,
      amortization,
    };
  }

  /**
   * Calcul du seuil de rentabilité (break-even point)
   */
  breakEven(fixedCosts: number, pricePerUnit: number, variableCostPerUnit: number): {
    breakEvenUnits: number;
    breakEvenRevenue: number;
    contribution: number;
    contributionMargin: number;
  } {
    const contribution = pricePerUnit - variableCostPerUnit;
    if (contribution <= 0) {
      throw new Error('Le coût variable ne peut pas être supérieur au prix unitaire');
    }

    const breakEvenUnits = Math.ceil(fixedCosts / contribution);
    const breakEvenRevenue = breakEvenUnits * pricePerUnit;
    const contributionMargin = pricePerUnit > 0 ? (contribution / pricePerUnit) * 100 : 0;

    return {
      breakEvenUnits,
      breakEvenRevenue: Math.round(breakEvenRevenue * 100) / 100,
      contribution: Math.round(contribution * 100) / 100,
      contributionMargin: Math.round(contributionMargin * 100) / 100,
    };
  }

  /**
   * Calcul de TVA (Taxe sur la Valeur Ajoutée) — pays africains
   */
  vatCalculation(amountHT: number, country: 'CM' | 'CI' | 'SN' | 'NG' | 'GH' | 'MA' | 'TN' | 'KE' = 'CM'): {
    vatRate: number;
    vatAmount: number;
    totalTTC: number;
  } {
    const vatRates: Record<string, number> = {
      'CM': 19.25, // Cameroun
      'CI': 18,    // Côte d'Ivoire
      'SN': 18,    // Sénégal
      'NG': 7.5,   // Nigeria (VAT)
      'GH': 15,    // Ghana
      'MA': 20,    // Maroc
      'TN': 19,    // Tunisie
      'KE': 16,    // Kenya
    };

    const rate = vatRates[country] || 19.25;
    const vatAmount = (amountHT * rate) / 100;
    const totalTTC = amountHT + vatAmount;

    return {
      vatRate: rate,
      vatAmount: Math.round(vatAmount * 100) / 100,
      totalTTC: Math.round(totalTTC * 100) / 100,
    };
  }

  /**
   * Calcul de retour sur investissement (ROI)
   */
  calculateROI(investment: number, gain: number, periodMonths?: number): {
    roi: number;
    roiPercent: number;
    annualizedROI: number;
    netGain: number;
  } {
    const netGain = gain - investment;
    const roiPercent = investment > 0 ? (netGain / investment) * 100 : 0;
    
    let annualizedROI = roiPercent;
    if (periodMonths && periodMonths > 0) {
      annualizedROI = (Math.pow(1 + netGain / investment, 12 / periodMonths) - 1) * 100;
    }

    return {
      roi: Math.round(netGain * 100) / 100,
      roiPercent: Math.round(roiPercent * 100) / 100,
      annualizedROI: Math.round(annualizedROI * 100) / 100,
      netGain: Math.round(netGain * 100) / 100,
    };
  }

  /**
   * Calcul de prix de vente optimal basé sur le coût et la marge souhaitée
   */
  optimalPrice(cost: number, targetMarginPercent: number, vatCountry?: 'CM' | 'CI' | 'SN' | 'NG' | 'GH' | 'MA' | 'TN' | 'KE'): {
    priceHT: number;
    vatAmount: number;
    priceTTC: number;
    profit: number;
  } {
    // Prix HT = Coût / (1 - marge%)
    const priceHT = cost / (1 - targetMarginPercent / 100);
    const profit = priceHT - cost;
    
    let vatAmount = 0;
    let priceTTC = priceHT;
    
    if (vatCountry) {
      const vat = this.vatCalculation(priceHT, vatCountry);
      vatAmount = vat.vatAmount;
      priceTTC = vat.totalTTC;
    }

    return {
      priceHT: Math.round(priceHT * 100) / 100,
      vatAmount: Math.round(vatAmount * 100) / 100,
      priceTTC: Math.round(priceTTC * 100) / 100,
      profit: Math.round(profit * 100) / 100,
    };
  }

  /**
   * Liste les devises supportées
   */
  listCurrencies(): CurrencyRate[] {
    return AFRICAN_CURRENCIES;
  }
}

export const businessCalculators = new BusinessCalculators();
