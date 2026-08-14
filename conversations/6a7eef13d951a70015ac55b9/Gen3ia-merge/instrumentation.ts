// Gen3ia — instrumentation.ts
// Phase 1.2: valide les variables d'environnement au démarrage (fail-fast)
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // 1) Valide les variables d'environnement AVANT tout lancement.
    //    Jette une erreur lisible (et arrête le boot) si une variable critique manque.
    try {
      const { validateEnv } = await import('@/lib/env-validation');
      const env = validateEnv();
      console.info(
        `[env-check] OK — NODE_ENV=${env.NODE_ENV}, ` +
          `reste de caches configurés: REDIS=${env.REDIS_URL ? 'oui' : 'non'}, ` +
          `Qdrant=${env.QDRANT_URL ? 'oui' : 'non'}.`,
      );
    } catch (e) {
      console.error('[env-check] Variable d\'environnement invalide :', e);
      throw e; // fail-fast : ne démarre pas l'app avec une config invalide
    }

    // 2) Init du tracing (après validation réussie)
    try {
      // 1. Validate all environment variables first
      const { validateEnv } = await import('@/lib/env-validation');
      validateEnv();
      
      // 2. Initialize tracing & monitoring
      const { initTracing } = await import('@/lib/tracing');
      initTracing();
      
      console.log('[Instrumentation] ✓ Application initialized successfully');
    } catch (e) {
      console.error('[Instrumentation] CRITICAL ERROR:', e);
      // Fail fast - don't start the app if initialization fails
      process.exit(1);
    }
  }
}
