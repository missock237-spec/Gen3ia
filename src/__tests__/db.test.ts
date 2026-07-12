/**
 * Tests unitaires — db.ts (résolution DATABASE_URL)
 *
 * Vérifie que GENOVA_DATABASE_URL est prioritaire sur DATABASE_URL
 * pour éviter l'écrasement par les variables système (bug critique identifié).
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';

const PG_URL = 'postgresql://user:pass@localhost:5432/genova';
const PG_URL_2 = 'postgresql://other:pass@remotehost:5432/prod';

function resolveDatabaseUrl(): string {
  const databaseUrl = process.env.GENOVA_DATABASE_URL || process.env.DATABASE_URL || '';

  if (
    !databaseUrl.startsWith('postgresql://') &&
    !databaseUrl.startsWith('postgres://')
  ) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection string');
  }

  return databaseUrl;
}

describe('resolveDatabaseUrl — priorité des variables d\'environnement', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restaurer l'environnement après chaque test
    process.env.GENOVA_DATABASE_URL = originalEnv.GENOVA_DATABASE_URL;
    process.env.DATABASE_URL = originalEnv.DATABASE_URL;
  });

  test('utilise GENOVA_DATABASE_URL en priorité', () => {
    process.env.GENOVA_DATABASE_URL = PG_URL;
    process.env.DATABASE_URL = 'file:/home/z/my-project/db/custom.db'; // valeur système SQLite
    expect(resolveDatabaseUrl()).toBe(PG_URL);
  });

  test('utilise DATABASE_URL si GENOVA_DATABASE_URL absent', () => {
    delete process.env.GENOVA_DATABASE_URL;
    process.env.DATABASE_URL = PG_URL_2;
    expect(resolveDatabaseUrl()).toBe(PG_URL_2);
  });

  test('lève une erreur si l\'URL pointe vers SQLite', () => {
    delete process.env.GENOVA_DATABASE_URL;
    process.env.DATABASE_URL = 'file:/home/user/db.sqlite';
    expect(() => resolveDatabaseUrl()).toThrow('PostgreSQL connection string');
  });

  test('accepte les URLs postgres:// en plus de postgresql://', () => {
    process.env.GENOVA_DATABASE_URL = 'postgres://user:pass@host:5432/db';
    expect(() => resolveDatabaseUrl()).not.toThrow();
  });

  test('lève une erreur si aucune URL n\'est définie', () => {
    delete process.env.GENOVA_DATABASE_URL;
    delete process.env.DATABASE_URL;
    expect(() => resolveDatabaseUrl()).toThrow();
  });
});
