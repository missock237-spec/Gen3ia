import { defineConfig } from 'vitest/config';
import path from 'path';
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    exclude: ['node_modules', 'src/__tests__/e2e'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      exclude: ['node_modules/', 'src/__tests__/', 'src/i18n/', '**/*.config.*', '**/*.d.ts'],
      // Seuils de couverture — cliquet à la hausse : augmenter à chaque sprint.
      // Cibles prioritaires : débit de crédits, quotas LLM, auth/2FA, webhooks, state-graph.
      thresholds: {
        statements: 40,
        branches: 30,
        functions: 35,
        lines: 40,
      },
      // Interdire toute regression de couverture per-fichier sur les zones critiques
      // (crédits, quotas, sécurité). Ajoutez ici les fichiers vitaux.
      thresholdAutoUpdate: true,
    },
    setupFiles: ['./src/__tests__/setup.ts'],
    testTimeout: 30000,
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});