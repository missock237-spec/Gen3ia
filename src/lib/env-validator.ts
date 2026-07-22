import { logger } from '@/lib/logger';

const REQUIRED = [
  { key: 'DATABASE_URL', desc: 'URL PostgreSQL' },
  { key: 'AUTH_SECRET', desc: 'Cle JWT (32+ caracteres)', validate: (v) => v.length >= 32 },
  { key: 'NEXT_PUBLIC_APP_URL', desc: 'URL publique' },
];

const OPTIONAL = [
  { key: 'REDIS_URL', desc: 'URL Redis (optionnel)' },
  { key: 'OPENAI_API_KEY', desc: 'Cle OpenAI' },
  { key: 'SENTRY_DSN', desc: 'DSN Sentry' },
  { key: 'CORS_ALLOWED_ORIGINS', desc: 'Origines CORS' },
];

export function validateEnv() {
  const errors = [];
  const warnings = [];
  for (const v of REQUIRED) {
    const val = process.env[v.key];
    if (!val) errors.push(v.key + ': ' + v.desc + ' — MANQUANT');
    else if (v.validate && !v.validate(val)) errors.push(v.key + ': ' + v.desc + ' — INVALIDE');
  }
  for (const v of OPTIONAL) {
    if (!process.env[v.key]) warnings.push(v.key + ': ' + v.desc + ' — NON CONFIGURE');
  }
  if (errors.length > 0) errors.forEach(e => logger.error(e));
  if (warnings.length > 0) warnings.forEach(w => logger.warn(w));
  if (errors.length === 0) logger.info('Toutes les variables requises sont configurees');
  return { valid: errors.length === 0, errors, warnings };
}
