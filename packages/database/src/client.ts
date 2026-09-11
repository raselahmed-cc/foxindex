import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

/**
 * The type `db.transaction(async (tx) => ...)` hands its callback — extracted
 * rather than hand-written against drizzle's own PgTransaction generics, so a
 * repository method can accept an optional `tx?: Database | Transaction` and
 * compose into a caller's existing transaction instead of always opening its
 * own (see docs/adr/0011 for the first caller that needs this).
 */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface CreateDbClientOptions {
  connectionString: string;
  /** Neon and most managed Postgres providers require TLS; local dev does not. */
  ssl?: boolean;
  max?: number;
  /** Fail fast instead of hanging when Postgres is unreachable (constitution §30). */
  connectionTimeoutMillis?: number;
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
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 5000,
  });

  // pg's Pool emits 'error' for problems on idle clients (e.g. the backend
  // restarting) — without a listener, Node treats it as an unhandled error and
  // crashes the process. Never let a transient DB blip take down the API.
  pool.on('error', () => {});

  const db = drizzle(pool, { schema });

  return { db, pool };
}
