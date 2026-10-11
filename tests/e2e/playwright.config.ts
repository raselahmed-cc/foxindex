import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { defineConfig } from '@playwright/test';

loadDotenv({ path: resolve(__dirname, '../../.env'), quiet: true });

const WEB_PORT = process.env.WEB_PORT ?? '3000';
const API_PORT = process.env.API_PORT ?? '3001';
const INDEXNOW_MOCK_PORT = '4012';

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  // Generous: this test runs the whole golden path against real Neon/Upstash
  // infra on webServers that just cold-booted — signup's scrypt hashing alone
  // is given up to 45s (see golden-path.spec.ts), and that's before the async
  // submission polling. 120s was observed too tight for a full cold run even
  // though no individual step was actually broken.
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 1 : 0,
  reporter: isCI ? 'github' : 'list',
  use: {
    // Must be 'localhost', not '127.0.0.1': the API's CORS_ORIGIN (.env) is
    // exactly http://localhost:3000, and cookie SameSite scoping treats the
    // hostname and the IP literal as different sites — either mismatch would
    // silently break the cross-origin session cookie the web app relies on.
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },

  // Every dependency the golden path touches — the IndexNow mock, the API,
  // the submission worker, and the web app — is launched here so
  // `pnpm test:e2e` is a single command with no manual orchestration step.
  // Nothing runs in Docker (this environment has no Docker daemon available);
  // each is a plain Node process against the same Neon/Upstash-backed
  // DATABASE_URL/REDIS_URL as local dev.
  webServer: [
    {
      command: 'pnpm --filter @foxindex/e2e run indexnow-mock',
      url: `http://127.0.0.1:${INDEXNOW_MOCK_PORT}/__health`,
      env: { PORT: INDEXNOW_MOCK_PORT },
      reuseExistingServer: !isCI,
      timeout: 15_000,
    },
    {
      command: 'pnpm --filter @foxindex/e2e exec maildev',
      url: 'http://127.0.0.1:1080',
      reuseExistingServer: !isCI,
      timeout: 15_000,
    },
    {
      command: 'pnpm --filter @foxindex/api run dev',
      url: `http://localhost:${API_PORT}/api/v1/health`,
      reuseExistingServer: !isCI,
      timeout: 45_000,
    },
    {
      command: 'pnpm --filter @foxindex/worker-submission run dev',
      env: { INDEXNOW_API_BASE_URL: `http://127.0.0.1:${INDEXNOW_MOCK_PORT}/indexnow` },
      reuseExistingServer: !isCI,
      timeout: 45_000,
    },
    {
      command: 'pnpm --filter @foxindex/web run dev',
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
  ],

  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
