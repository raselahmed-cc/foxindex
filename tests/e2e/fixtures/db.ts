import { resolve } from 'node:path';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';
import { createDbClient, schema } from '@foxindex/database';

config({ path: resolve(__dirname, '../../../.env'), quiet: true });

const { db, pool } = createDbClient({
  connectionString: process.env.DATABASE_URL ?? 'postgres://foxindex:foxindex@localhost:5432/foxindex',
});

/**
 * The API never exposes `indexnowKeyLocation` for editing (production infers
 * it from the domain's own hostname) — the test reaches into the DB directly
 * to point it at the local key-file-server fixture instead.
 */
export async function setDomainKeyLocation(domainId: string, keyLocationUrl: string): Promise<void> {
  await db.update(schema.domains).set({ indexnowKeyLocation: keyLocationUrl }).where(eq(schema.domains.id, domainId));
}

export async function closeDb(): Promise<void> {
  await pool.end();
}
