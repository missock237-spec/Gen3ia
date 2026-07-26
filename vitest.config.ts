import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'src/**/__tests__/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'dist'],
    testTimeout: 30000,
    hookTimeout: 30000,
    retry: 0,
    passWithNoTests: true,
    bail: 1,
    coverage: {
      provider: 'v8',
      enabled: true,
      include: ['src/lib/**/*.ts', 'src/app/api/**/*.ts', 'src/components/**/*.tsx'],
      exclude: [
        'node_modules',
        '.next',
        'dist',
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/**/__tests__/**',
        'src/**/*.d.ts',
      ],
      reporter: ['text', 'json', 'lcov', 'html', 'clover'],
      reportsDirectory: './coverage',
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
      clean: true,
      cleanOnRerun: true,
      reportOnFailure: true,
      skipFull: false,
    },
    typecheck: {
      enabled: false,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@test': path.resolve(__dirname, './src/__tests__'),
    },
  },
});
