// GET /api/notifications — Récupérer les notifications non lues
import { getUnreadNotifications } from '@/lib/push-notifications';
import { createApiHandler } from '@/lib/api/handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Forme de réponse historique conservée à l'identique :
//   { notifications: [...], unreadCount: number }
// (le frontend en dépend — d'où envelope: false / passthrough legacy)
//
// Correctif : l'ancienne implémentation décodait le cookie de session comme
// du base64url JSON (JSON.parse(Buffer.from(cookie, 'base64url'))) alors
// qu'il s'agit d'un JWT de session Firebase signé — la route renvoyait
// donc 401 en permanence, quelle que soit la session. Désormais :
// vérification cryptographique via applySecurity() (couche 2 de défense)
// + rate limiting distribué 60 req/min (équivalent RATE_LIMIT_PRESETS.default,
// appliqué par le limiter Redis + fallback mémoire).
export const GET = createApiHandler(
  async ({ auth }) => {
    // requireAuth: true ⇒ auth garanti non-null à ce stade.
    const notifications = await getUnreadNotifications(auth!.userId);
    return { notifications, unreadCount: notifications.length };
  },
  {
    requireAuth: true,
    envelope: false,
    rateLimit: { limit: 60, windowMs: 60_000 },
  },
);
