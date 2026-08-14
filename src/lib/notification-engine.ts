// ============================================================
// Gen3ia — Notification engine shim (compatibilité)
// ============================================================
//  Préserve l'API :
//    import { notificationEngine, NotificationEngine } from '@/lib/notification-engine'
//
//  Backend : Firebase Cloud Messaging + Firestore (collection `notifications`).
// ============================================================

export {
  NotificationEngine,
  notificationEngine,
  type CreateNotificationInput,
  type PushPayload,
  type DeviceRegistration,
} from '@/lib/firebase/messaging';

export { default } from '@/lib/firebase/messaging';
