// ============================================================
// API Pagination — Helper générique pour la pagination
// cursor-based compatible avec Prisma
// ============================================================

import { errorResponse, ErrorCode, successResponse } from './api-error';
import { NextRequest, NextResponse } from 'next/server';

export interface PaginationParams {
  limit: number;
  cursor?: string;
  direction: 'next' | 'prev';
}

export interface PaginationMeta {
  hasMore: boolean;
  nextCursor?: string;
  prevCursor?: string;
  total?: number;
}

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: PaginationMeta;
}

/**
 * Extrait les paramètres de pagination d'une requête Next.js
 */
export function parsePaginationParams(request: NextRequest): PaginationParams {
  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10), 1), 100);
  const cursor = searchParams.get('cursor') || undefined;
  const direction = (searchParams.get('direction') as 'next' | 'prev') || 'next';

  return { limit, cursor, direction };
}

/**
 * Construit les options Prisma pour la pagination cursor-based
 */
export function buildPrismaCursorOptions<T extends { id: string }>(
  params: PaginationParams,
  orderField: string = 'createdAt',
  orderDirection: 'asc' | 'desc' = 'desc'
): {
  take: number;
  skip?: number;
  cursor?: { id: string };
  orderBy: Record<string, 'asc' | 'desc'>[];
} {
  const options: {
    take: number;
    skip?: number;
    cursor?: { id: string };
    orderBy: Record<string, 'asc' | 'desc'>[];
  } = {
    take: params.direction === 'prev' ? -params.limit : params.limit + 1,
    orderBy: [{ [orderField]: orderDirection }, { id: orderDirection }],
  };

  if (params.cursor) {
    options.cursor = { id: params.cursor };
    options.skip = 1; // Skip le cursor lui-même
  }

  return options;
}

/**
 * Construit la réponse paginée
 */
export function buildPaginatedResponse<T extends { id: string }>(
  items: T[],
  params: PaginationParams,
  total?: number
): PaginatedResponse<T> {
  const hasMore = items.length > params.limit;
  const data = hasMore ? items.slice(0, params.limit) : items;

  const pagination: PaginationMeta = {
    hasMore,
    total,
  };

  if (data.length > 0) {
    pagination.nextCursor = data[data.length - 1].id;
    pagination.prevCursor = data[0].id;
  }

  return {
    success: true,
    data,
    pagination,
  };
}

/**
 * Wrapper complet pour les endpoints de listing
 * Utilisation : return paginatedResponse(request, db.agent.findMany({ ... }), total);
 */
export async function paginatedResponse<T extends { id: string }>(
  request: NextRequest,
  queryFn: (options: ReturnType<typeof buildPrismaCursorOptions>) => Promise<T[]>,
  countFn?: () => Promise<number>,
  orderField: string = 'createdAt',
  orderDirection: 'asc' | 'desc' = 'desc'
): Promise<NextResponse<PaginatedResponse<T>>> {
  try {
    const params = parsePaginationParams(request);
    const options = buildPrismaCursorOptions(params, orderField, orderDirection);

    const [items, total] = await Promise.all([
      queryFn(options),
      countFn ? countFn() : Promise.resolve(undefined),
    ]);

    const response = buildPaginatedResponse(items, params, total);
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur de pagination';
    return errorResponse(message, ErrorCode.INTERNAL_ERROR, 500);
  }
}
