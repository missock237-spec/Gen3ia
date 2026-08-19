// Gen3ia — instrumentation.ts
// Valide les variables d'environnement au démarrage (fail-fast)
// puis initialise le tracing et la surveillance.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // 1) Valider les variables d'environnement AVANT tout lancement.
    //    Jette une erreur lisible et arrête le boot si une variable critique manque.
    try {
      const { validateEnv } = await import('@/lib/env-validation');
      const env = validateEnv();
      // eslint-disable-next-line no-console
      console.info(
        `[env-check] OK — NODE_ENV=${env.NODE_ENV}, ` +
          `REDIS=${env.REDIS_URL ? 'oui' : 'non'}, ` +
          `Qdrant=${env.QDRANT_URL ? 'oui' : 'non'}.
`,
      );
    } catch (e) {
      console.error('[env-check] Variable d\'environnement invalide :', e);
      throw e; // fail-fast
    }

    // 2) Init du tracing (après validation réussie)
    try {
      const { initTracing } = await import('@/lib/tracing');
      initTracing();
      // eslint-disable-next-line no-console
      console.log('[Instrumentation] Application initialized successfully');
    } catch (e) {
      console.error('[Instrumentation] CRITICAL ERROR:', e);
      process.exit(1);
    }
  }
}
