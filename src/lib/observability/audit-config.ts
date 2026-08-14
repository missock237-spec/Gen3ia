export type AuditCategory = "auth" | "credits" | "api" | "admin" | "debug";

export interface RetentionPolicy {
  days: number;
  backend: "s3" | "siem" | "bigquery";
  legalMandate?: string;
}

export const RETENTION: Record<AuditCategory, RetentionPolicy> = {
  auth:    { days: 365,  backend: "siem",     legalMandate: "RGPD art. 5-6 (limitation de conservation)" },
  credits: { days: 730,  backend: "bigquery", legalMandate: "Facturation / fiscalité — 48 mois" },
  api:     { days: 365,  backend: "bigquery" },
  admin:   { days: 1825, backend: "s3" },
  debug:   { days: 30,   backend: "s3" },
};
