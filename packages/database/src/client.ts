import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

export interface CreateDbClientOptions {
  connectionString: string;
  /** Neon and most managed Postgres providers require TLS; local dev does not. */
  ssl?: boolean;
  max?: number;
}

/**
 * A plain `pg` Pool + drizzle-orm/node-postgres, not the Neon serverless HTTP
 * driver — this app runs as long-lived containers (workers, API replicas), not
 * edge functions, so a standard pooled wire-protocol connection is the right fit
 * and the same code works unchanged against local Postgres or Neon (constitution
 * §26/§29): only DATABASE_URL changes between environments.
 */
export function createDbClient(options: CreateDbClientOptions): { db: Database; pool: Pool } {
  const pool = new Pool({
    connectionString: options.connectionString,
    ssl: options.ssl ? { rejectUnauthorized: true } : undefined,
    max: options.max ?? 10,
  });

  const db = drizzle(pool, { schema });

  return { db, pool };
}
