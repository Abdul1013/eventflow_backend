import { config } from 'dotenv';
config(); // load apps/api/.env before any test module is evaluated

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/types/**'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
      },
    },
    setupFiles: ['./src/test/setup.ts'],
  },
});
