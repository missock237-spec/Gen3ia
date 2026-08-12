import { RETENTION, AuditCategory } from "./audit-config";

export interface AuditEntry {
  id: string;
  ts: string;
  category: AuditCategory;
  actor: string;
  action: string;
  resource?: string;
  ip?: string;
  metadata?: Record<string, unknown>;
  expiresAt: string;
}

export function computeExpiry(ts: Date, category: AuditCategory): string {
  const days = RETENTION[category].days;
  return new Date(ts.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function buildAuditEntry(input: Omit<AuditEntry, "id" | "expiresAt">, id?: string): AuditEntry {
  const ts = new Date(input.ts);
  const rnd = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(16).slice(2);
  return {
    ...input,
    ts: ts.toISOString(),
    id: id ?? `${input.ts}-${rnd}`,
    expiresAt: computeExpiry(ts, input.category),
  };
}

export function isExpired(entry: { expiresAt: string }, now = new Date()): boolean {
  return new Date(entry.expiresAt).getTime() < now.getTime();
}
