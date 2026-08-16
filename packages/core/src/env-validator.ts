// ============================================================
// Gen3ia — Environment Variable Validator
// Valide les variables d'environnement au demarrage
// ============================================================
//  Stack actuelle : Cloud Firestore (Firebase).
//  - Admin SDK : FIREBASE_PROJECT_ID requis, plus une des deux formes
//    de credentials : FIREBASE_SERVICE_ACCOUNT (JSON) OU
//    FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.
//  - Client (navigateur) : variables NEXT_PUBLIC_FIREBASE_* requises.
//  Les anciennes variables Prisma/Postgres (DATABASE_URL) et NextAuth
//  (AUTH_SECRET) ont ete retirees.
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
  {
    key: 'FIREBASE_PROJECT_ID',
    type: 'string',
    required: true,
    description: 'Identifiant du projet Firebase (Admin SDK et client)',
    example: 'gen3ia',
  },
  {
    key: 'NEXT_PUBLIC_FIREBASE_API_KEY',
    type: 'string',
    required: true,
    description: 'Cle publique Firebase API Key',
  },
  {
    key: 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    type: 'string',
    required: true,
    description: "Domaine d'authentification Firebase",
    example: 'gen3ia.firebaseapp.com',
  },
  {
    key: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    type: 'string',
    required: true,
    description: 'Identifiant public du projet Firebase (client)',
  },
  {
    key: 'NEXT_PUBLIC_FIREBASE_APP_ID',
    type: 'string',
    required: true,
    description: 'Firebase Web App ID',
  },
  {
    key: 'NEXT_PUBLIC_APP_URL',
    type: 'url',
    required: true,
    description: 'URL publique de l application',
  },
];

// Variables de credentials Firebase Admin. La validation exige qu'au moins
// une des deux formes soit complete :
//   A) FIREBASE_SERVICE_ACCOUNT (JSON du compte de service)
//   B) FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
// (la validation de groupe est effectuee dans validateEnv()).
export const FIREBASE_ADMIN_CREDENTIAL_KEYS: string[] = [
  'FIREBASE_SERVICE_ACCOUNT',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
];

export const OPTIONAL_ENV_VARS: EnvVarDefinition[] = [
  // ---- Firebase Admin SDK (une des deux formes requise par groupe) ----
  { key: 'FIREBASE_SERVICE_ACCOUNT', type: 'string', required: false, description: 'Compte de service Firebase (JSON) — alternative aux variables separees' },
  { key: 'FIREBASE_CLIENT_EMAIL', type: 'string', required: false, description: 'Email du compte de service Firebase (format separe)' },
  { key: 'FIREBASE_PRIVATE_KEY', type: 'string', required: false, description: 'Cle privee du compte de service Firebase (format separe)' },
  { key: 'FIREBASE_STORAGE_BUCKET', type: 'string', required: false, description: 'Bucket Firebase Storage (Admin SDK)' },
  // ---- Firebase client (navigateur) ----
  { key: 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', type: 'string', required: false, description: 'Bucket Firebase Storage (client)' },
  { key: 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', type: 'string', required: false, description: 'Messaging Sender ID' },
  { key: 'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID', type: 'string', required: false, description: 'Google Analytics Measurement ID' },
  { key: 'NEXT_PUBLIC_FIREBASE_DATABASE_URL', type: 'url', required: false, description: 'URL Realtime Database (optionnel)' },
  // ---- Infrastructure / Cache ----
  { key: 'REDIS_URL', type: 'url', required: false, description: 'Connexion Redis pour BullMQ / rate limiting' },
  { key: 'QDRANT_URL', type: 'url', required: false, description: 'URL Qdrant pour la memoire vectorielle' },
  { key: 'UPSTASH_REDIS_REST_URL', type: 'url', required: false, description: 'URL REST Upstash Redis (optionnel)' },
  { key: 'UPSTASH_REDIS_REST_TOKEN', type: 'string', required: false, description: 'Token REST Upstash Redis (optionnel)' },
  // ---- IA / LLM ----
  { key: 'OPENAI_API_KEY', type: 'string', required: false, description: 'Cle API OpenAI (sk-...)', minLength: 20 },
  { key: 'ANTHROPIC_API_KEY', type: 'string', required: false, description: 'Cle API Anthropic' },
  { key: 'GROQ_API_KEY', type: 'string', required: false, description: 'Cle API Groq' },
  { key: 'HUGGINGFACE_API_KEY', type: 'string', required: false, description: 'Cle API Hugging Face (hf_...)' },
  { key: 'HUGGINGFACE_TOKEN', type: 'string', required: false, description: 'Token Hugging Face' },
  // ---- Paiements (Chariow) ----
  { key: 'CHARIOW_API_KEY', type: 'string', required: false, description: 'Cle API Chariow' },
  { key: 'CHARIOW_WEBHOOK_SECRET', type: 'jwt-secret', required: false, description: 'Secret webhook Chariow', minLength: 16 },
  { key: 'CHARIOW_API_URL', type: 'url', required: false, description: 'Base URL de l API Chariow', default: 'https://api.chariow.com/v1' },
  // ---- Email ----
  { key: 'SMTP_HOST', type: 'string', required: false, description: 'Hote SMTP' },
  { key: 'SMTP_PORT', type: 'number', required: false, description: 'Port SMTP', default: '587' },
  { key: 'SMTP_USER', type: 'string', required: false, description: 'Utilisateur SMTP' },
  { key: 'SMTP_PASS', type: 'string', required: false, description: 'Mot de passe SMTP' },
  { key: 'EMAIL_FROM', type: 'string', required: false, description: 'Adresse expediteur des emails' },
  // ---- OAuth ----
  { key: 'GOOGLE_CLIENT_ID', type: 'string', required: false, description: 'Google OAuth Client ID' },
  { key: 'GOOGLE_CLIENT_SECRET', type: 'string', required: false, description: 'Google OAuth Client Secret' },
  { key: 'GITHUB_CLIENT_ID', type: 'string', required: false, description: 'GitHub OAuth Client ID' },
  { key: 'GITHUB_CLIENT_SECRET', type: 'string', required: false, description: 'GitHub OAuth Client Secret' },
  // ---- Monitoring / Observabilite ----
  { key: 'SENTRY_DSN', type: 'url', required: false, description: 'DSN Sentry pour le monitoring' },
  { key: 'SENTRY_ORG', type: 'string', required: false, description: 'Organisation Sentry' },
  { key: 'SENTRY_PROJECT', type: 'string', required: false, description: 'Projet Sentry' },
  { key: 'LOKI_URL', type: 'url', required: false, description: 'URL Loki (logs)' },
  // ---- Securite / Secrets internes ----
  { key: 'VAULT_MASTER_KEY', type: 'string', required: false, description: 'Cle maitresse de chiffrement (hex)', minLength: 32 },
  { key: 'ADMIN_EMAILS', type: 'string', required: false, description: 'Emails administrateurs (separes par des virgules)' },
  { key: 'INTERNAL_SERVICE_SECRET', type: 'jwt-secret', required: false, description: 'Secret interne entre services', minLength: 32 },
  { key: 'CRON_SECRET', type: 'jwt-secret', required: false, description: 'Secret des taches cron', minLength: 32 },
  // ---- Divers ----
  { key: 'HEAP_THRESHOLD_MB', type: 'number', required: false, description: 'Seuil memoire pour alerte (MB)', default: '500' },
];

function checkFirebaseAdminCredential(): EnvError | null {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (sa && sa.trim().length > 0) {
    try {
      JSON.parse(sa);
      return null;
    } catch {
      return {
        key: 'FIREBASE_SERVICE_ACCOUNT',
        message: 'FIREBASE_SERVICE_ACCOUNT contient un JSON invalide',
        severity: 'error' as const,
      };
    }
  }

  const email = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (email && email.trim().length > 0 && privateKey && privateKey.trim().length > 0) {
    return null;
  }

  return {
    key: 'FIREBASE_ADMIN_CREDENTIAL',
    message:
      'Credentials Firebase Admin manquants : fournir FIREBASE_SERVICE_ACCOUNT (JSON) OU FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY',
    severity: 'error' as const,
  };
}

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

  // Groupe : credentials Firebase Admin (une des deux formes requise)
  const credError = checkFirebaseAdminCredential();
  if (credError) errors.push(credError);

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
  if (def.minLength && value.length < def.minLength && def.type !== 'number') {
    return { key: def.key, message: `${def.key} trop court (${value.length} < ${def.minLength})`, severity: 'error' };
  }
  return null;
}

export function getEnvStatus() {
  const result = validateEnv();
  return {
    status: result.valid ? 'healthy' : 'degraded',
    required: REQUIRED_ENV_VARS.map((v) => ({
      key: v.key,
      set: !!process.env[v.key],
      valid: !result.errors.find((e) => e.key === v.key),
    })),
    optional: OPTIONAL_ENV_VARS.map((v) => ({
      key: v.key,
      set: !!process.env[v.key],
    })),
    errors: result.errors,
    warnings: result.warnings,
  };
}

export function assertEnv(): void {
  const result = validateEnv();
  if (!result.valid) {
    const messages = result.errors.map((e) => `  [ERREUR] ${e.message}`).join('\n');
    console.error('\n=== Erreurs de configuration ===\n' + messages + '\n');
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Configuration invalide: ${result.errors.length} erreur(s)`);
    }
  }
  if (result.warnings.length > 0) {
    const messages = result.warnings.map((w) => `  [AVERTISSEMENT] ${w.message}`).join('\n');
    console.warn('\n=== Avertissements de configuration ===\n' + messages + '\n');
  }
}
