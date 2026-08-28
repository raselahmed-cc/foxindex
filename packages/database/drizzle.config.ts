import { resolve } from 'node:path';
import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// dotenv >=16.4 prints an unsolicited promotional "tip" line to stdout unless
// suppressed — noise we don't want in CI/deploy logs.
config({ path: resolve(__dirname, '../../.env'), quiet: true });

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://foxindex:foxindex@localhost:5432/foxindex',
  },
  verbose: true,
  strict: true,
});
