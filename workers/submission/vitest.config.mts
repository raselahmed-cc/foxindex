import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    // The Postgres-backed specs share one database (Google accounts, quotas) — run files one at a time.
    fileParallelism: false,
  },
});
