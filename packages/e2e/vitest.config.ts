import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    // The whole suite shares one running server + one database; keep it serial.
    fileParallelism: false,
    hookTimeout: 180_000,
    testTimeout: 120_000,
  },
});
