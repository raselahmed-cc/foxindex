import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDbClient } from './client';

// Local dev reads the repo .env; containers get real environment variables (and have no .env).
try {
  process.loadEnvFile(resolve(__dirname, '../../../.env'));
} catch {
  // no .env file — fine in production
}

async function main() {
  const connectionString =
    process.env.DATABASE_URL ?? 'postgres://foxindex:foxindex@localhost:5432/foxindex';
  const { db, pool } = createDbClient({ connectionString, ssl: process.env.DATABASE_SSL === 'true' });

  console.log(`Running migrations against ${connectionString.replace(/:[^:@]+@/, ':***@')}`);
  await migrate(db, { migrationsFolder: resolve(__dirname, '../migrations') });
  console.log('Migrations complete.');

  await pool.end();
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
