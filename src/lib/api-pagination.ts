/**
 * Pagination cursor standard pour les routes de liste — v3.2 (audit perf).
 *
 * Avant : `findMany()` sans `take` sur agents, skills, apikeys, knowledge →
 * requêtes non bornées (peu risqué aujourd'hui, scopé par utilisateur, mais
 * autant paginer maintenant que quand ça fera mal).
 *
 * Usage :
 *   const { limit, cursor } = listParams(new URL(req.url).searchParams)
 *   const rows = await db.agent.findMany({
 *     where: { userId }, orderBy: { createdAt: "desc" },
 *     take: limit + 1,
 *     ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
 *   })
 *   const { page, nextCursor } = paginate(rows, limit)
 *   return Response.json({ ok: true, agents: page, nextCursor })
 *
 * Rétro-compatible : sans paramètres, renvoie les `limit` premiers éléments
 * (les consommateurs existants reçoivent toujours un tableau) ; `nextCursor`
 * est un champ additif ignoré par l'existant, prêt pour le chargement
 * progressif côté interface.
 */

export interface ListPagination {
  limit: number
  cursor: string | null
}

/** Lit `?limit=` (borné) et `?cursor=` depuis les query params. */
export function listParams(
  searchParams: URLSearchParams,
  defaultLimit = 50,
  maxLimit = 100
): ListPagination {
  const raw = Number(searchParams.get("limit"))
  const limit =
    Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), maxLimit) : defaultLimit
  const cursor = searchParams.get("cursor")?.trim() || null
  return { limit, cursor }
}

/**
 * Tronque la page (take = limit + 1) et calcule le curseur suivant.
 * `null` signifie « plus rien à charger ».
 */
export function paginate<T extends { id: string }>(
  rows: T[],
  limit: number
): { page: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  return { page, nextCursor: hasMore ? page[page.length - 1].id : null }
}
