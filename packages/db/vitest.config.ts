import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    // Integration tests hit a real database; run serially for deterministic locking.
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
