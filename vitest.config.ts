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
      thresholds: { statements: 35, branches: 25, functions: 30, lines: 35 },
    },
    setupFiles: ['./src/__tests__/setup.ts'],
    testTimeout: 30000,
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});