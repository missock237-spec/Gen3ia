import { BaseRepository, OrderByClause, WhereOp, FindManyArgs } from './base.repository.js';

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
  const ops = Object.entries(where)
    .filter(([k]) => k !== 'id')
    .map(([field, value]) => ({ field, op: '==' as const, value }));
  return ops.length > 0 ? ops : undefined;
}

function orderToClauses(orderBy?: Record<string, 'asc' | 'desc'>): OrderByClause[] | undefined {
  if (!orderBy) return undefined;
  const clauses = Object.entries(orderBy).map(([field, direction]) => ({ field, direction }));
  return clauses.length > 0 ? clauses : undefined;
}

export class CreditTransactionRepository extends BaseRepository<CreditTransactionRecord> {
  constructor() {
    super('credits');
  }

  /**
   * Surcharge acceptant un `FindTransactionArgs` Prisma-like (where: Record<string, unknown>).
   * Convertit vers le `FindManyArgs` interne (where: WhereOp[]).
   * La signature reste compatible avec la base car `FindTransactionArgs` est structurellement
   * assignable à `FindManyArgs` après normalisation (où `where` devient `WhereOp[]`).
   */
  async findMany(args: FindTransactionArgs | FindManyArgs = {}): Promise<CreditTransactionRecord[]> {
    // Si l'appelant fournit déjà un FindManyArgs (where: WhereOp[]), on passe directement.
    if ('where' in args && args.where !== undefined && Array.isArray(args.where)) {
      return super.findMany(args as FindManyArgs);
    }
    // Sinon, on normalise le Record<string, unknown> Prisma-like.
    const txArgs = args as FindTransactionArgs;
    return super.findMany({
      where: whereToOps(txArgs.where),
      orderBy: orderToClauses(txArgs.orderBy),
      take: txArgs.take,
      skip: txArgs.skip,
    });
  }

  /** Surcharge acceptant `WhereOp[]` (héritée) ou `Record<string, unknown>` (Prisma-like). */
  async count(where?: WhereOp[] | Record<string, unknown>): Promise<number> {
    const ops = Array.isArray(where) ? where : whereToOps(where as Record<string, unknown> | undefined);
    return super.count(ops);
  }
}

export const creditTransactionRepository = new CreditTransactionRepository();
