// ============================================================
// Gen3ia — SMS Engine (Twilio)
// ============================================================
//  Envoie des SMS d'alerte pour les événements critiques :
//    - Agent terminé / échoué
//    - Crédits épuisés / seuil bas
//    - Tâche programmée terminée
//    - Alerte de sécurité
//
//  Pourquoi des SMS ? En Afrique, la data n'est pas toujours
//  disponible ou abordable. Le SMS est le canal le plus fiable
//  pour notifier un utilisateur qu'il doit se reconnecter.
//
//  Fallback : si Twilio n'est pas configuré, on log seulement.
// ============================================================

import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';

const log = createLogger('sms-engine');

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || '';
const TWILIO_SMS_ENABLED = process.env.TWILIO_SMS_ENABLED === 'true';

export type SmsSeverity = 'info' | 'warning' | 'critical';

export interface SmsMessage {
  to: string;          // Numéro E.164 (ex: +237691234567)
  body: string;        // Max 160 chars (SMS standard)
  severity?: SmsSeverity;
}

export interface SmsAlertInput {
  userId: string;
  type: 'agent_complete' | 'agent_failed' | 'credits_low' | 'credits_empty' | 'task_done' | 'security_alert' | 'payment_received';
  message: string;
  agentName?: string;
}

interface UserSmsPreferences {
  smsEnabled: boolean;
  phoneNumber: string | null;
  alertTypes: string[]; // Types d'alertes que l'utilisateur veut recevoir
  quietHoursStart: number; // 0-23 (heure locale)
  quietHoursEnd: number;
}

const DEFAULT_ALERT_TYPES: SmsAlertInput['type'][] = [
  'agent_failed',
  'credits_empty',
  'security_alert',
  'payment_received',
];

/**
 * Récupère les préférences SMS d'un utilisateur.
 */
async function getUserSmsPrefs(userId: string): Promise<UserSmsPreferences | null> {
  try {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return null;

    return {
      smsEnabled: (user as Record<string, unknown>).smsAlertsEnabled as boolean ?? false,
      phoneNumber: (user as Record<string, unknown>).phoneNumber as string | null,
      alertTypes: ((user as Record<string, unknown>).smsAlertTypes as string[]) ?? DEFAULT_ALERT_TYPES,
      quietHoursStart: ((user as Record<string, unknown>).smsQuietHoursStart as number) ?? 22,
      quietHoursEnd: ((user as Record<string, unknown>).smsQuietHoursEnd as number) ?? 7,
    };
  } catch (err) {
    log.error('getUserSmsPrefs failed', { userId, error: String(err) });
    return null;
  }
}

/**
 * Vérifie si on est dans les heures de silence.
 */
function isInQuietHours(start: number, end: number, hour: number): boolean {
  if (start < end) {
    return hour >= start && hour < end;
  }
  // Cas où la plage traverse minuit (ex: 22h → 7h)
  return hour >= start || hour < end;
}

/**
 * Envoie un SMS via Twilio.
 * Utilise fetch natif (pas de dépendance twilio npm) — l'API REST Twilio
 * est simple : POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages.json
 */
async function sendTwilioSms(to: string, body: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    log.warn('Twilio not configured — SMS not sent', { to });
    return { success: false, error: 'Twilio not configured' };
  }

  // Tronquer le body à 160 caractères (limite SMS standard)
  const truncatedBody = body.length > 160 ? body.substring(0, 157) + '...' : body;

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

    const formData = new URLSearchParams();
    formData.append('To', to);
    formData.append('From', TWILIO_FROM_NUMBER);
    formData.append('Body', truncatedBody);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      const errorData = await response.text();
      log.error('Twilio SMS failed', { to, status: response.status, error: errorData });
      return { success: false, error: `Twilio error ${response.status}: ${errorData}` };
    }

    const data = await response.json() as { sid: string };
    log.info('SMS sent', { to, messageId: data.sid });
    return { success: true, messageId: data.sid };
  } catch (err) {
    log.error('Twilio SMS exception', { to, error: String(err) });
    return { success: false, error: String(err) };
  }
}

/**
 * Formatage des messages SMS selon le type d'alerte.
 */
function formatSmsMessage(input: SmsAlertInput): string {
  const prefix = 'Gen3ia';
  switch (input.type) {
    case 'agent_complete':
      return `${prefix}: L'agent "${input.agentName || 'Agent'}" a termine sa tache. ${input.message}`;
    case 'agent_failed':
      return `${prefix} ALERTE: L'agent "${input.agentName || 'Agent'}" a echoue. ${input.message}`;
    case 'credits_low':
      return `${prefix}: Vos credits sont bas. ${input.message} Reconnectez-vous pour recharger.`;
    case 'credits_empty':
      return `${prefix} ALERTE: Vos credits sont epuises! Vos agents sont en pause. Rechargez via l'app.`;
    case 'task_done':
      return `${prefix}: Tache programmee terminee. ${input.message}`;
    case 'security_alert':
      return `${prefix} SECURITE: ${input.message}`;
    case 'payment_received':
      return `${prefix}: Paiement recu! ${input.message} Credits credites sur votre compte.`;
    default:
      return `${prefix}: ${input.message}`;
  }
}

/**
 * Envoie une alerte SMS à un utilisateur.
 * Vérifie les préférences, les heures de silence, et le type d'alerte.
 */
export async function sendSmsAlert(input: SmsAlertInput): Promise<{ sent: boolean; reason?: string }> {
  // Vérifier si SMS est activé globalement
  if (!TWILIO_SMS_ENABLED) {
    return { sent: false, reason: 'SMS disabled globally (TWILIO_SMS_ENABLED not set)' };
  }

  const prefs = await getUserSmsPrefs(input.userId);
  if (!prefs) {
    return { sent: false, reason: 'User not found' };
  }

  if (!prefs.smsEnabled) {
    return { sent: false, reason: 'User has SMS alerts disabled' };
  }

  if (!prefs.phoneNumber) {
    return { sent: false, reason: 'No phone number on file' };
  }

  // Vérifier le type d'alerte
  if (!prefs.alertTypes.includes(input.type)) {
    return { sent: false, reason: `Alert type '${input.type}' not in user preferences` };
  }

  // Vérifier les heures de silence (sauf pour les alertes critiques)
  const now = new Date();
  const hour = now.getHours();
  if (input.type !== 'security_alert' && isInQuietHours(prefs.quietHoursStart, prefs.quietHoursEnd, hour)) {
    log.info('SMS skipped — quiet hours', { userId: input.userId, hour });
    return { sent: false, reason: 'Quiet hours' };
  }

  // Formatter et envoyer
  const body = formatSmsMessage(input);
  const result = await sendTwilioSms(prefs.phoneNumber, body);

  return { sent: result.success, reason: result.error };
}

/**
 * Envoie un SMS direct (bypass des préférences — usage admin seulement).
 */
export async function sendDirectSms(to: string, body: string): Promise<{ success: boolean; error?: string }> {
  const result = await sendTwilioSms(to, body);
  return { success: result.success, error: result.error };
}

/**
 * Vérifie si Twilio SMS est configuré.
 */
export function isSmsConfigured(): boolean {
  return TWILIO_SMS_ENABLED && !!TWILIO_ACCOUNT_SID && !!TWILIO_AUTH_TOKEN && !!TWILIO_FROM_NUMBER;
}

// ============================================================
// Intégration avec le moteur de notifications existant
// ============================================================

/**
 * Hook à appeler après la création d'une notification.
 * Si l'utilisateur a activé les SMS, envoie aussi un SMS.
 */
export async function maybeSendSmsForNotification(
  userId: string,
  type: string,
  title: string,
  message: string
): Promise<void> {
  // Mapper les types de notification aux types d'alerte SMS
  const typeMap: Record<string, SmsAlertInput['type']> = {
    'agent_completed': 'agent_complete',
    'agent_failed': 'agent_failed',
    'credits_low': 'credits_low',
    'credits_empty': 'credits_empty',
    'task_scheduled_done': 'task_done',
    'security_alert': 'security_alert',
    'payment_received': 'payment_received',
  };

  const smsType = typeMap[type];
  if (!smsType) return;

  await sendSmsAlert({
    userId,
    type: smsType,
    message: message || title,
  }).catch((err) => {
    log.error('maybeSendSmsForNotification failed', { userId, type, error: String(err) });
  });
}
