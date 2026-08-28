import { resolve } from 'node:path';
import { config } from 'dotenv';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDbClient } from './client';

config({ path: resolve(__dirname, '../../../.env'), quiet: true });

async function main() {
  const connectionString =
    process.env.DATABASE_URL ?? 'postgres://foxindex:foxindex@localhost:5432/foxindex';
  const { db, pool } = createDbClient({ connectionString });

  console.log(`Running migrations against ${connectionString.replace(/:[^:@]+@/, ':***@')}`);
  await migrate(db, { migrationsFolder: resolve(__dirname, '../migrations') });
  console.log('Migrations complete.');

  await pool.end();
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
