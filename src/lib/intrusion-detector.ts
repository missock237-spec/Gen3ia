// ============================================================
// INTRUSION DETECTOR — Détection de patterns anormaux
// ============================================================

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

interface IntrusionAlert {
  type: "brute_force" | "rate_abuse" | "suspicious_ip" | "token_reuse" | "unusual_hours";
  severity: "low" | "medium" | "high" | "critical";
  identifier: string;
  details: Record<string, unknown>;
}

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_LOGIN_ATTEMPTS = 10;
const MAX_API_CALLS = 500;

const inMemoryTracker = new Map<string, { count: number; firstAttempt: number; blocked: boolean }>();

// Nettoie le tracker toutes les 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of inMemoryTracker.entries()) {
    if (now - value.firstAttempt > WINDOW_MS) {
      inMemoryTracker.delete(key);
    }
  }
}, 5 * 60 * 1000);

export function trackLoginAttempt(identifier: string, success: boolean): IntrusionAlert | null {
  const key = `login:${identifier}`;
  const now = Date.now();

  let entry = inMemoryTracker.get(key);
  if (!entry || now - entry.firstAttempt > WINDOW_MS) {
    entry = { count: 0, firstAttempt: now, blocked: false };
  }

  entry.count++;

  if (entry.count > MAX_LOGIN_ATTEMPTS && !entry.blocked) {
    entry.blocked = true;
    inMemoryTracker.set(key, entry);

    const alert: IntrusionAlert = {
      type: "brute_force",
      severity: "high",
      identifier,
      details: { attempts: entry.count, windowMs: WINDOW_MS, success },
    };

    logIntrusion(alert);
    return alert;
  }

  inMemoryTracker.set(key, entry);
  return null;
}

export function trackApiCall(identifier: string, pathname: string): IntrusionAlert | null {
  const key = `api:${identifier}`;
  const now = Date.now();

  let entry = inMemoryTracker.get(key);
  if (!entry || now - entry.firstAttempt > WINDOW_MS) {
    entry = { count: 0, firstAttempt: now, blocked: false };
  }

  entry.count++;

  if (entry.count > MAX_API_CALLS && !entry.blocked) {
    entry.blocked = true;
    inMemoryTracker.set(key, entry);

    const alert: IntrusionAlert = {
      type: "rate_abuse",
      severity: "medium",
      identifier,
      details: { calls: entry.count, windowMs: WINDOW_MS, path: pathname },
    };

    logIntrusion(alert);
    return alert;
  }

  inMemoryTracker.set(key, entry);
  return null;
}

export function checkUnusualHours(userId: string): IntrusionAlert | null {
  const hour = new Date().getHours();
  const isUnusualHour = hour >= 0 && hour <= 5;

  if (isUnusualHour) {
    const alert: IntrusionAlert = {
      type: "unusual_hours",
      severity: "low",
      identifier: userId,
      details: { hour, date: new Date().toISOString() },
    };

    logIntrusion(alert);
    return alert;
  }

  return null;
}

async function logIntrusion(alert: IntrusionAlert): Promise<void> {
  logger.warn("intrusion_detected", {
    type: alert.type,
    severity: alert.severity,
    identifier: alert.identifier,
    details: alert.details,
  });

  try {
    await prisma.monitoringEvent.create({
      data: {
        userId: alert.identifier.startsWith("login:") ? "unknown" : alert.identifier,
        eventType: `intrusion_${alert.type}`,
        source: "intrusion-detector",
        message: `Alerte ${alert.severity}: ${alert.type} pour ${alert.identifier}`,
        severity: alert.severity === "critical" || alert.severity === "high" ? "error" : alert.severity === "medium" ? "warning" : "info",
        details: JSON.stringify(alert.details),
      },
    });
  } catch (error) {
    console.error("Échec de la journalisation d'intrusion:", error);
  }
}