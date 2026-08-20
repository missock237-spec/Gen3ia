import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getApps } from 'firebase-admin/app';
import { getAdminDb } from './firebase/admin';

export interface AgentCostRecord {
  id?: string;
  agentId: string;
  conversationId: string;
  userId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costInCredits: number;
  timestamp: string;
}

export interface AgentBudget {
  agentId: string;
  userId: string;
  dailyLimit: number;
  monthlyLimit: number;
  alertThreshold: number; // 0 to 1
  isEnabled: boolean;
  currentDailySpend: number;
  currentMonthlySpend: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CostBreakdownResult {
  byAgent: Record<string, { totalCost: number; totalTokens: number; count: number }>;
  byDay: Record<string, { totalCost: number; totalTokens: number; count: number }>;
  byModel: Record<string, { totalCost: number; totalTokens: number; count: number }>;
  records: AgentCostRecord[];
  totalSpend: number;
  totalTokens: number;
}

export interface BudgetCheckResult {
  allowed: boolean;
  reason?: string;
  remaining: {
    daily: number;
    monthly: number;
  };
}

export interface AlertTriggerResult {
  alertTriggered: boolean;
  message?: string;
  currentRatio: number;
}

// In-memory fallback stores when Firestore is offline or uninitialized
const inMemoryCosts: AgentCostRecord[] = [];
const inMemoryBudgets: Map<string, AgentBudget> = new Map();

function getDbSafe(): Firestore | null {
  try {
    return getAdminDb();
  } catch {
    try {
      const app = getApps()[0];
      if (app) return getFirestore(app, process.env.FIREBASE_DATABASE_ID || 'gen3ia');
      return null;
    } catch {
      return null;
    }
  }
}

export class AgentCostTracker {
  public async trackCost(
    record: Omit<AgentCostRecord, 'id'> | AgentCostRecord
  ): Promise<AgentCostRecord> {
    const inputTokens = Number(record.inputTokens) || 0;
    const outputTokens = Number(record.outputTokens) || 0;
    const totalTokens = Number(record.totalTokens) || inputTokens + outputTokens;
    const costInCredits = Number(record.costInCredits) || 0;
    const timestamp = record.timestamp
      ? new Date(record.timestamp).toISOString()
      : new Date().toISOString();

    const id =
      'id' in record && record.id
        ? record.id
        : `cost_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const fullRecord: AgentCostRecord = {
      id,
      agentId: record.agentId,
      conversationId: record.conversationId || 'default',
      userId: record.userId,
      model: record.model || 'unknown',
      inputTokens,
      outputTokens,
      totalTokens,
      costInCredits,
      timestamp,
    };

    inMemoryCosts.push(fullRecord);

    const db = getDbSafe();
    if (db) {
      try {
        await db.collection('agent_costs').doc(id).set(fullRecord);
      } catch (err) {
        console.warn('[AgentCostTracker] Failed to save to Firestore, using fallback:', err);
      }
    }

    return fullRecord;
  }

  public async getDailySpend(agentId: string, userId: string): Promise<number> {
    const now = new Date();
    const startOfDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    ).toISOString();

    const db = getDbSafe();
    if (db) {
      try {
        const snapshot = await db
          .collection('agent_costs')
          .where('userId', '==', userId)
          .where('agentId', '==', agentId)
          .where('timestamp', '>=', startOfDay)
          .get();

        if (!snapshot.empty) {
          let total = 0;
          snapshot.docs.forEach((doc) => {
            const data = doc.data() as AgentCostRecord;
            total += Number(data.costInCredits) || 0;
          });
          return total;
        }
      } catch (err) {
        console.warn('[AgentCostTracker] Firestore daily spend query failed, using fallback:', err);
      }
    }

    return inMemoryCosts
      .filter(
        (r) =>
          r.userId === userId &&
          r.agentId === agentId &&
          r.timestamp >= startOfDay
      )
      .reduce((sum, r) => sum + (Number(r.costInCredits) || 0), 0);
  }

  public async getMonthlySpend(agentId: string, userId: string): Promise<number> {
    const now = new Date();
    const startOfMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    ).toISOString();

    const db = getDbSafe();
    if (db) {
      try {
        const snapshot = await db
          .collection('agent_costs')
          .where('userId', '==', userId)
          .where('agentId', '==', agentId)
          .where('timestamp', '>=', startOfMonth)
          .get();

        if (!snapshot.empty) {
          let total = 0;
          snapshot.docs.forEach((doc) => {
            const data = doc.data() as AgentCostRecord;
            total += Number(data.costInCredits) || 0;
          });
          return total;
        }
      } catch (err) {
        console.warn('[AgentCostTracker] Firestore monthly spend query failed, using fallback:', err);
      }
    }

    return inMemoryCosts
      .filter(
        (r) =>
          r.userId === userId &&
          r.agentId === agentId &&
          r.timestamp >= startOfMonth
      )
      .reduce((sum, r) => sum + (Number(r.costInCredits) || 0), 0);
  }

  public async getCostBreakdown(
    userId: string,
    dateRange?: { startDate?: string; endDate?: string; agentId?: string }
  ): Promise<CostBreakdownResult> {
    const fetchedRecords: AgentCostRecord[] = [];

    const db = getDbSafe();
    if (db) {
      try {
        const snapshot = await db
          .collection('agent_costs')
          .where('userId', '==', userId)
          .get();

        snapshot.docs.forEach((doc) => {
          fetchedRecords.push(doc.data() as AgentCostRecord);
        });
      } catch (err) {
        console.warn('[AgentCostTracker] Firestore breakdown query failed, using fallback:', err);
      }
    }

    const recordMap = new Map<string, AgentCostRecord>();
    fetchedRecords.concat(inMemoryCosts).forEach((r) => {
      if (r.userId === userId) {
        recordMap.set(r.id || `${r.agentId}_${r.timestamp}`, r);
      }
    });

    let filteredRecords = Array.from(recordMap.values());

    if (dateRange?.agentId) {
      filteredRecords = filteredRecords.filter((r) => r.agentId === dateRange.agentId);
    }
    if (dateRange?.startDate) {
      const startISO = new Date(dateRange.startDate).toISOString();
      filteredRecords = filteredRecords.filter((r) => r.timestamp >= startISO);
    }
    if (dateRange?.endDate) {
      const endISO = new Date(dateRange.endDate).toISOString();
      filteredRecords = filteredRecords.filter((r) => r.timestamp <= endISO);
    }

    const byAgent: Record<string, { totalCost: number; totalTokens: number; count: number }> = {};
    const byDay: Record<string, { totalCost: number; totalTokens: number; count: number }> = {};
    const byModel: Record<string, { totalCost: number; totalTokens: number; count: number }> = {};
    let totalSpend = 0;
    let totalTokens = 0;

    filteredRecords.forEach((r) => {
      const cost = Number(r.costInCredits) || 0;
      const tokens = Number(r.totalTokens) || 0;
      const day = r.timestamp ? r.timestamp.slice(0, 10) : new Date().toISOString().slice(0, 10);
      const agent = r.agentId || 'unknown';
      const model = r.model || 'unknown';

      totalSpend += cost;
      totalTokens += tokens;

      if (!byAgent[agent]) {
        byAgent[agent] = { totalCost: 0, totalTokens: 0, count: 0 };
      }
      byAgent[agent].totalCost += cost;
      byAgent[agent].totalTokens += tokens;
      byAgent[agent].count += 1;

      if (!byDay[day]) {
        byDay[day] = { totalCost: 0, totalTokens: 0, count: 0 };
      }
      byDay[day].totalCost += cost;
      byDay[day].totalTokens += tokens;
      byDay[day].count += 1;

      if (!byModel[model]) {
        byModel[model] = { totalCost: 0, totalTokens: 0, count: 0 };
      }
      byModel[model].totalCost += cost;
      byModel[model].totalTokens += tokens;
      byModel[model].count += 1;
    });

    return {
      byAgent,
      byDay,
      byModel,
      records: filteredRecords,
      totalSpend,
      totalTokens,
    };
  }
}

export class BudgetGuard {
  private tracker: AgentCostTracker;

  constructor(tracker: AgentCostTracker = new AgentCostTracker()) {
    this.tracker = tracker;
  }

  private getBudgetKey(userId: string, agentId: string): string {
    return `${userId}_${agentId}`;
  }

  public async getBudget(agentId: string, userId: string): Promise<AgentBudget | null> {
    const key = this.getBudgetKey(userId, agentId);
    let budget: AgentBudget | null = inMemoryBudgets.get(key) || null;

    const db = getDbSafe();
    if (db) {
      try {
        const docRef = db.collection('agent_budgets').doc(key);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
          budget = docSnap.data() as AgentBudget;
        }
      } catch (err) {
        console.warn('[BudgetGuard] Firestore get error, using fallback:', err);
      }
    }

    if (!budget) return null;

    const currentDailySpend = await this.tracker.getDailySpend(agentId, userId);
    const currentMonthlySpend = await this.tracker.getMonthlySpend(agentId, userId);

    const updatedBudget: AgentBudget = {
      ...budget,
      currentDailySpend,
      currentMonthlySpend,
    };

    inMemoryBudgets.set(key, updatedBudget);
    return updatedBudget;
  }

  public async checkBudget(agentId: string, userId: string): Promise<BudgetCheckResult> {
    const budget = await this.getBudget(agentId, userId);

    if (!budget || !budget.isEnabled) {
      return {
        allowed: true,
        remaining: { daily: Infinity, monthly: Infinity },
      };
    }

    const currentDailySpend = budget.currentDailySpend;
    const currentMonthlySpend = budget.currentMonthlySpend;

    const dailyRemaining =
      budget.dailyLimit > 0 ? Math.max(0, budget.dailyLimit - currentDailySpend) : Infinity;

    const monthlyRemaining =
      budget.monthlyLimit > 0 ? Math.max(0, budget.monthlyLimit - currentMonthlySpend) : Infinity;

    if (budget.dailyLimit > 0 && currentDailySpend >= budget.dailyLimit) {
      return {
        allowed: false,
        reason: `Daily credit limit reached (${currentDailySpend.toFixed(2)} / ${budget.dailyLimit} credits)`,
        remaining: { daily: 0, monthly: monthlyRemaining },
      };
    }

    if (budget.monthlyLimit > 0 && currentMonthlySpend >= budget.monthlyLimit) {
      return {
        allowed: false,
        reason: `Monthly credit limit reached (${currentMonthlySpend.toFixed(2)} / ${budget.monthlyLimit} credits)`,
        remaining: { daily: dailyRemaining, monthly: 0 },
      };
    }

    await this.triggerAlert(agentId, userId, budget.alertThreshold);

    return {
      allowed: true,
      remaining: { daily: dailyRemaining, monthly: monthlyRemaining },
    };
  }

  public async updateBudget(
    agentId: string,
    userId: string,
    config: Partial<Omit<AgentBudget, 'agentId' | 'userId'>>
  ): Promise<AgentBudget> {
    const key = this.getBudgetKey(userId, agentId);
    const existing = await this.getBudget(agentId, userId);

    const currentDailySpend = await this.tracker.getDailySpend(agentId, userId);
    const currentMonthlySpend = await this.tracker.getMonthlySpend(agentId, userId);

    const nowIso = new Date().toISOString();

    const budget: AgentBudget = {
      agentId,
      userId,
      dailyLimit: config.dailyLimit ?? existing?.dailyLimit ?? 0,
      monthlyLimit: config.monthlyLimit ?? existing?.monthlyLimit ?? 0,
      alertThreshold: config.alertThreshold ?? existing?.alertThreshold ?? 0.8,
      isEnabled: config.isEnabled ?? existing?.isEnabled ?? true,
      currentDailySpend,
      currentMonthlySpend,
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    inMemoryBudgets.set(key, budget);

    const db = getDbSafe();
    if (db) {
      try {
        await db.collection('agent_budgets').doc(key).set(budget, { merge: true });
      } catch (err) {
        console.warn('[BudgetGuard] Firestore update error, saved in memory:', err);
      }
    }

    return budget;
  }

  public async deleteBudget(agentId: string, userId: string): Promise<boolean> {
    const key = this.getBudgetKey(userId, agentId);
    inMemoryBudgets.delete(key);

    const db = getDbSafe();
    if (db) {
      try {
        await db.collection('agent_budgets').doc(key).delete();
      } catch (err) {
        console.warn('[BudgetGuard] Firestore delete error:', err);
      }
    }

    return true;
  }

  public async triggerAlert(
    agentId: string,
    userId: string,
    threshold: number
  ): Promise<AlertTriggerResult> {
    const budget = await this.getBudget(agentId, userId);
    if (!budget || !budget.isEnabled) {
      return { alertTriggered: false, currentRatio: 0 };
    }

    const dailyRatio = budget.dailyLimit > 0 ? budget.currentDailySpend / budget.dailyLimit : 0;
    const monthlyRatio =
      budget.monthlyLimit > 0 ? budget.currentMonthlySpend / budget.monthlyLimit : 0;
    const maxRatio = Math.max(dailyRatio, monthlyRatio);

    const targetThreshold = threshold ?? budget.alertThreshold ?? 0.8;

    if (maxRatio >= targetThreshold) {
      const type = dailyRatio >= monthlyRatio ? 'daily' : 'monthly';
      const limit = type === 'daily' ? budget.dailyLimit : budget.monthlyLimit;
      const spend = type === 'daily' ? budget.currentDailySpend : budget.currentMonthlySpend;
      const pct = (maxRatio * 100).toFixed(1);

      const message = `Alert: Agent "${agentId}" has reached ${pct}% of its ${type} credit limit (${spend.toFixed(2)} / ${limit} credits).`;

      console.warn(`[BudgetGuard Alert] ${message}`);

      return {
        alertTriggered: true,
        message,
        currentRatio: maxRatio,
      };
    }

    return {
      alertTriggered: false,
      currentRatio: maxRatio,
    };
  }
}

export const agentCostTracker = new AgentCostTracker();
export const budgetGuard = new BudgetGuard(agentCostTracker);
