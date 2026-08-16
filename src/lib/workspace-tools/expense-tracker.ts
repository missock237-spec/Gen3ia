// ============================================================
// EXPENSE TRACKER — Suivi des dépenses quotidiennes
// Catégorisation, budgets, résumés mensuels en FCFA/local
// ============================================================

export interface Expense {
  id: string;
  amount: number;
  currency: string;
  category: string;
  description: string;
  date: string;
  paymentMethod: 'cash' | 'mobile_money' | 'card' | 'bank' | 'credit';
}

export interface ExpenseSummary {
  total: number;
  byCategory: Record<string, number>;
  byPaymentMethod: Record<string, number>;
  dailyAverage: number;
  topExpense: Expense | null;
  trend: 'up' | 'down' | 'stable';
  currency: string;
}

export const EXPENSE_CATEGORIES = [
  'food', 'transport', 'utilities', 'rent', 'health', 'education',
  'business', 'entertainment', 'communication', 'savings', 'other',
] as const;

export const CURRENCIES = ['XOF', 'XAF', 'NGN', 'GHS', 'KES', 'MAD', 'EGP', 'ZAR', 'EUR', 'USD'];

export class ExpenseTracker {
  private expenses: Map<string, Expense> = new Map();

  add(expense: Omit<Expense, 'id'>): Expense {
    const id = `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const full = { ...expense, id };
    this.expenses.set(id, full);
    return full;
  }

  update(id: string, data: Partial<Expense>): Expense | null {
    const existing = this.expenses.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...data, id };
    this.expenses.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.expenses.delete(id);
  }

  list(category?: string, limit = 50): Expense[] {
    let items = Array.from(this.expenses.values());
    if (category) items = items.filter(e => e.category === category);
    return items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
  }

  getSummary(currency = 'XOF', periodDays = 30): ExpenseSummary {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - periodDays);
    const recent = Array.from(this.expenses.values())
      .filter(e => new Date(e.date) >= cutoff && e.currency === currency);

    const total = recent.reduce((sum, e) => sum + e.amount, 0);

    const byCategory: Record<string, number> = {};
    const byPaymentMethod: Record<string, number> = {};
    recent.forEach(e => {
      byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
      byPaymentMethod[e.paymentMethod] = (byPaymentMethod[e.paymentMethod] || 0) + e.amount;
    });

    const topExpense = recent.length > 0
      ? recent.reduce((max, e) => e.amount > max.amount ? e : max, recent[0])
      : null;

    // Trend: compare last 7 days vs previous 7 days
    const last7 = this.sumForDays(recent, 7);
    const prev7 = this.sumForDays(recent, 14) - last7;
    const trend: 'up' | 'down' | 'stable' = prev7 === 0 ? 'stable' : last7 > prev7 * 1.1 ? 'up' : last7 < prev7 * 0.9 ? 'down' : 'stable';

    return {
      total: Math.round(total * 100) / 100,
      byCategory,
      byPaymentMethod,
      dailyAverage: Math.round((total / periodDays) * 100) / 100,
      topExpense,
      trend,
      currency,
    };
  }

  private sumForDays(expenses: Expense[], days: number): number {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return expenses.filter(e => new Date(e.date) >= cutoff).reduce((s, e) => s + e.amount, 0);
  }

  budgetCheck(budget: number, currency = 'XOF'): { spent: number; remaining: number; percent: number; alert: boolean } {
    const summary = this.getSummary(currency, 30);
    const percent = budget > 0 ? (summary.total / budget) * 100 : 0;
    return {
      spent: summary.total,
      remaining: Math.max(0, budget - summary.total),
      percent: Math.round(percent * 100) / 100,
      alert: percent >= 80,
    };
  }
}

export const expenseTracker = new ExpenseTracker();
