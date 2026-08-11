import { BaseRepository, OrderByClause, WhereOp } from './base.repository.js';

// ============================================================
// CreditTransactionRepository — collection Firestore 'credits'
// ============================================================

export interface CreditTransactionRecord extends Record<string, unknown> {
  id: string;
  userId?: string;
  amount?: number;
  type?: 'purchase' | 'usage' | string;
  description?: string;
  createdAt?: Date;
}

interface FindTransactionArgs {
  where?: Record<string, unknown>;
  orderBy?: Record<string, 'asc' | 'desc'>;
  take?: number;
  skip?: number;
}

function whereToOps(where?: Record<string, unknown>): WhereOp[] | undefined {
  if (!where) return undefined;
  return Object.entries(where)
    .filter(([k]) => k !== 'id')
    .map(([field, value]) => ({ field, op: '==' as const, value }));
}

function orderToClauses(orderBy?: Record<string, 'asc' | 'desc'>): OrderByClause[] | undefined {
  if (!orderBy) return undefined;
  return Object.entries(orderBy).map(([field, direction]) => ({ field, direction }));
}

export class CreditTransactionRepository extends BaseRepository<CreditTransactionRecord> {
  constructor() {
    super('credits');
  }

  async findMany(args: FindTransactionArgs = {}): Promise<CreditTransactionRecord[]> {
    return super.findMany({
      where: whereToOps(args.where),
      orderBy: orderToClauses(args.orderBy),
      take: args.take,
      skip: args.skip,
    });
  }

  async count(where?: Record<string, unknown>): Promise<number> {
    return super.count(whereToOps(where));
  }
}

export const creditTransactionRepository = new CreditTransactionRepository();
