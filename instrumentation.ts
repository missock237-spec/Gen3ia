export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
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
