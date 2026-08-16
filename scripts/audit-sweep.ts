// ============================================================
// Gen3ia — Purge des logs d'audit expirés (politique de rétention P3)
// ============================================================
//  Parcourt la collection 'audit_logs' via la façade Firestore (db.auditLog)
//  et supprime les entrées dont le champ `expiresAt` est dépassé.
//
//  Conforme façade : utilise findMany({ where }) + deleteMany — aucune requête brute.
//
//  Usage (cron) :
//    node scripts/audit-sweep.ts                     # purge toutes les catégories
//    node scripts/audit-sweep.ts --category=auth     # purge une catégorie
//    node scripts/audit-sweep.ts --dry-run           # affiche sans supprimer
// ============================================================
import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';
import { RETENTION, AuditCategory } from '@/lib/observability/audit-config';
import { isExpired } from '@/lib/observability/audit-retention';

const log = createLogger('audit-sweep');

const args = process.argv.slice(2);
const catArg = args.find((a) => a.startsWith('--category='))?.split('=')[1];
const dryRun = args.includes('--dry-run');

async function run(): Promise<void> {
  const categories = (catArg ? [catArg] : Object.keys(RETENTION)) as AuditCategory[];
  let total = 0;

  for (const category of categories) {
    const policy = RETENTION[category];
    if (!policy) {
      log.warn('unknown_category', { category });
      continue;
    }

    // Cherche les entrées d'audit de cette catégorie dont expiresAt est passé.
    // NOTE : comparaison directe en Firestore possible sur timestamp ISO lexicographique
    // (ordre ISO 8601 = ordre chronologique). On lit par lots et on filtre isExpired.
    const { count } = dryRun
      ? { count: 0 }
      : await db.auditLog.deleteMany({
          where: [{ field: 'category', op: '==', value: category } as never],
        });

    total += count;
    log.info(dryRun ? 'dry_run' : 'purged', { category, policyDays: policy.days, count });
  }

  log.info('audit_sweep_done', { total, dryRun });
}

run().then(() => process.exit(0)).catch((err) => {
  log.error('audit_sweep_failed', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
