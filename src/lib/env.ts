/**
 * env.ts — Validation et résolution des variables d'environnement
 *
 * IMPORTANT : GENOVA_DATABASE_URL est prioritaire sur DATABASE_URL.
 * Cela évite que des variables système (ex: SQLite défini globalement)
 * n'écrasent l'URL PostgreSQL définie dans .env.
 *
 * Bug corrigé : la variable système DATABASE_URL=file:/... pointait vers
 * SQLite et écrasait la configuration .env PostgreSQL.
 * Solution : utiliser GENOVA_DATABASE_URL comme clé dédiée au projet.
 */

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value || value.trim() === '') {
    throw new Error(
      `Environment variable "${name}" is required but not set. ` +
      `Please copy .env.example to .env and fill in all required values.`
    );
  }

  return value;
}

/**
 * Résout l'URL de la base de données en donnant la priorité à
 * GENOVA_DATABASE_URL pour éviter les conflits avec des variables système.
 */
function resolveDatabaseUrl(): string {
  // Priorité 1 : variable dédiée au projet (recommandée)
  const genovaUrl = process.env.GENOVA_DATABASE_URL;
  if (genovaUrl && genovaUrl.trim() !== '') {
    return genovaUrl;
  }

  // Priorité 2 : variable standard (peut être écrasée par le système)
  const standardUrl = process.env.DATABASE_URL;
  if (standardUrl && standardUrl.trim() !== '') {
    return standardUrl;
  }

  throw new Error(
    'DATABASE_URL (or GENOVA_DATABASE_URL) is required. ' +
    'Set GENOVA_DATABASE_URL in your .env file to avoid conflicts with system environment variables.'
  );
}

export const env = {
  DATABASE_URL: resolveDatabaseUrl(),
} as const;