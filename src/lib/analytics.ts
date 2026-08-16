// ============================================================
// Gen3ia — Analytics shim (compatibilité)
// ============================================================
//  Préserve l'API :
//    import { trackAgentUsage, trackAICost, aggregateDailyUsage, logMonitoringEvent } from '@/lib/analytics'
//
//  Backend : Firebase Analytics (client) + Firestore (serveur).
// ============================================================

export {
  logEvent,
  trackAgentUsage,
  trackAICost,
  aggregateDailyUsage,
  logMonitoringEvent,
  createAuditLog,
  trackClientEvent,
  Collections,
  type LogEventInput,
  type AuditLogInput,
} from '@/lib/firebase/analytics';

// Default export — provide a single object aggregating all analytics helpers.
import * as analyticsNS from '@/lib/firebase/analytics';
export default analyticsNS;
