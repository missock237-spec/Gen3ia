// ============================================================
// Gen3ia — Environment Variable Validator
// Valide les variables d'environnement au demarrage
// ============================================================

export type EnvVarType = 'string' | 'number' | 'url' | 'jwt-secret';

export interface EnvVarDefinition {
  key: string;
  type: EnvVarType;
  required: boolean;
  description: string;
  minLength?: number;
  default?: string;
  example?: string;
}

export interface EnvValidationResult {
  valid: boolean;
  errors: EnvError[];
  warnings: EnvWarning[];
}

export interface EnvError {
  key: string;
  message: string;
  severity: 'error';
}

export interface EnvWarning {
  key: string;
  message: string;
  severity: 'warning';
}

export const REQUIRED_ENV_VARS: EnvVarDefinition[] = [
  { key: 'DATABASE_URL', type: 'url', required: true, description: 'Connexion PostgreSQL' },
  { key: 'AUTH_SECRET', type: 'jwt-secret', required: true, description: 'Secret JWT (min 32 caracteres)', minLength: 32, example: 'votre-secret-tres-long-au-moins-32-caracteres' },
  { key: 'NEXT_PUBLIC_APP_URL', type: 'url', required: true, description: 'URL publique de l application' },
];

export const OPTIONAL_ENV_VARS: EnvVarDefinition[] = [
  { key: 'OPENAI_API_KEY', type: 'string', required: false, description: 'Cle API OpenAI (sk-...)', minLength: 20 },
  { key: 'ANTHROPIC_API_KEY', type: 'string', required: false, description: 'Cle API Anthropic' },
  { key: 'GROQ_API_KEY', type: 'string', required: false, description: 'Cle API Groq' },
  { key: 'HUGGINGFACE_API_KEY', type: 'string', required: false, description: 'Cle API Hugging Face (hf_...)' },
  { key: 'REDIS_URL', type: 'url', required: false, description: 'Connexion Redis pour BullMQ' },
  { key: 'STRIPE_SECRET_KEY', type: 'string', required: false, description: 'Cle secrete Stripe (sk_...)' },
  { key: 'GOOGLE_CLIENT_ID', type: 'string', required: false, description: 'Google OAuth Client ID' },
  { key: 'GOOGLE_CLIENT_SECRET', type: 'string', required: false, description: 'Google OAuth Client Secret' },
  { key: 'GITHUB_CLIENT_ID', type: 'string', required: false, description: 'GitHub OAuth Client ID' },
  { key: 'GITHUB_CLIENT_SECRET', type: 'string', required: false, description: 'GitHub OAuth Client Secret' },
  { key: 'SENTRY_DSN', type: 'url', required: false, description: 'DSN Sentry pour le monitoring' },
  { key: 'N8N_HOST', type: 'string', required: false, description: 'Host n8n' },
  { key: 'HEAP_THRESHOLD_MB', type: 'number', required: false, description: 'Seuil memoire pour alerte (MB)', default: '500' },
];

export function validateEnv(): EnvValidationResult {
  const errors: EnvError[] = [];
  const warnings: EnvWarning[] = [];

  for (const def of REQUIRED_ENV_VARS) {
    const value = process.env[def.key];
    if (!value || value.trim() === '') {
      errors.push({
        key: def.key,
        message: `Variable requise manquante: ${def.key} — ${def.description}${def.example ? ` (ex: ${def.example})` : ''}`,
        severity: 'error',
      });
      continue;
    }
    const typeError = checkType(def, value);
    if (typeError) errors.push(typeError);
  }

  for (const def of OPTIONAL_ENV_VARS) {
    const value = process.env[def.key];
    if (!value || value.trim() === '') {
      if (def.default) {
        process.env[def.key] = def.default;
      } else {
        warnings.push({
          key: def.key,
          message: `Variable optionnelle non definie: ${def.key} — ${def.description}`,
          severity: 'warning',
        });
      }
      continue;
    }
    const typeError = checkType(def, value);
    if (typeError) warnings.push({ ...typeError, severity: 'warning' as const });
  }

  return { valid: errors.length === 0, errors, warnings };
}

function checkType(def: EnvVarDefinition, value: string): EnvError | null {
  switch (def.type) {
    case 'url':
      try {
        new URL(value);
      } catch {
        return { key: def.key, message: `URL invalide pour ${def.key}: "${value.substring(0, 50)}"`, severity: 'error' };
      }
      break;
    case 'jwt-secret':
      if (def.minLength && value.length < def.minLength) {
        return { key: def.key, message: `${def.key} trop court (${value.length} < ${def.minLength} caracteres)`, severity: 'error' };
      }
      break;
    case 'number':
      if (isNaN(Number(value))) {
        return { key: def.key, message: `${def.key} doit etre un nombre (recu: "${value}")`, severity: 'error' };
      }
      break;
  }
  if (def.minLength && value.length < def.minLength) {
    return { key: def.key, message: `${def.key} trop court (${value.length} < ${def.minLength})`, severity: 'error' };
  }
  return null;
}

export function getEnvStatus() {
  const result = validateEnv();
  return {
    status: result.valid ? 'healthy' : 'degraded',
    required: REQUIRED_ENV_VARS.map(v => ({
      key: v.key, set: !!process.env[v.key], valid: !result.errors.find(e => e.key === v.key),
    })),
    optional: OPTIONAL_ENV_VARS.map(v => ({
      key: v.key, set: !!process.env[v.key],
    })),
    errors: result.errors,
    warnings: result.warnings,
  };
}

export function assertEnv(): void {
  const result = validateEnv();
  if (!result.valid) {
    const messages = result.errors.map(e => `  [ERREUR] ${e.message}`).join('\n');
    console.error('\n=== Erreurs de configuration ===\n' + messages + '\n');
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Configuration invalide: ${result.errors.length} erreur(s)`);
    }
  }
  if (result.warnings.length > 0) {
    const messages = result.warnings.map(w => `  [AVERTISSEMENT] ${w.message}`).join('\n');
    console.warn('\n=== Avertissements de configuration ===\n' + messages + '\n');
  }
}
