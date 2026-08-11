// ============================================================
// Gen3ia — Audit trail shim (compatibilité)
// ============================================================
//  Préserve l'API : import { createAuditLog } from '@/lib/audit-trail'
//  Backend : Firestore (collection `audit_logs`).
// ============================================================

export { createAuditLog, type AuditLogInput } from '@/lib/firebase/analytics';
