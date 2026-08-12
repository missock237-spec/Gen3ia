import { defineConfig } from 'vitest/config';
import path from 'path';
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Inclut les suites racine ET les suites colocalisées (src/**/__tests__) :
    // rate-limit, otel, audit-retention, worker-config, etc.
    include: [
      'src/__tests__/**/*.test.ts',
      'src/**/__tests__/**/*.test.ts',
      'src/**/*.test.ts',
    ],
    exclude: [
      'node_modules',
      'src/__tests__/e2e',
      '**/node_modules/**',
      '.next/**',
      '.turbo/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      exclude: ['node_modules/', 'src/__tests__/', 'src/i18n/', '**/*.config.*', '**/*.d.ts'],
      thresholds: {
        statements: 40,
        branches: 30,
        functions: 35,
        lines: 40,
      },
      thresholdAutoUpdate: true,
    },
    setupFiles: ['./src/__tests__/setup.ts'],
    testTimeout: 30000,
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});