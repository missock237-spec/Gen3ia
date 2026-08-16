// ============================================================
// Gen3ia — Extension DB (modèles legacy supplémentaires)
// ============================================================
//  Étend la façade Firestore avec les modèles Prisma legacy encore
//  référencés par du code (routes/libs) non encore migré :
//    - aiCost (alias de aICost)
//    - activityLog      -> 'activity_logs'
//    - alertRule        -> 'alert_rules'
//    - alertEvent       -> 'alert_events'
//    - agentDelegation  -> 'agent_delegations'
//    - referral         -> 'referrals'
//    - pushSubscription -> 'push_subscriptions'
//    - session          -> Collections.sessions
//    - terminalSession  -> 'terminal_sessions'
// ============================================================
import {
  db as baseDb,
  Collections,
  FirestoreRepository,
} from '@/lib/firebase/firestore';

function makeRepo(name: string): FirestoreRepository<Record<string, unknown>> {
  return new FirestoreRepository<Record<string, unknown>>(name);
}

const legacy = {
  activityLog: makeRepo('activity_logs'),
  alertRule: makeRepo('alert_rules'),
  alertEvent: makeRepo('alert_events'),
  agentDelegation: makeRepo('agent_delegations'),
  referral: makeRepo('referrals'),
  pushSubscription: makeRepo('push_subscriptions'),
  session: makeRepo(Collections.sessions),
  terminalSession: makeRepo('terminal_sessions'),
} as const;

export const dbExt = {
  ...baseDb,
  aiCost: baseDb.aICost,
  ...legacy,
} as const;

export const db = dbExt;
export const prisma = dbExt;
export default dbExt;

export { Collections, FirestoreRepository };
