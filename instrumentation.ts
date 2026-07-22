export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { initTracing } = await import('@/lib/tracing');
      initTracing();
    } catch (e) {
      console.error('Instrumentation error:', e);
    }
  }
}
