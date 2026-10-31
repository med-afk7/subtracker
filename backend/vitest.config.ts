import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Points the app at the test database before any app module is imported
    setupFiles: ['tests/setup/env.ts'],
    // Applies migrations to the test database once per run
    globalSetup: ['tests/setup/migrate.ts'],
    // Integration tests share one database, so test files run one at a time
    fileParallelism: false,
    // Integration tests make many round trips to a real (remote) database; 5s is too tight
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
