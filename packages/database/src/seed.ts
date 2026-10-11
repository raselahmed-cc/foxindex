import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import * as argon2 from 'argon2';
import { createDbClient } from './client';
import { creditPacks, indexingProviders, paymentMethods, users } from './schema';

// Local dev reads the repo .env; containers get real environment variables (and have no .env).
try {
  process.loadEnvFile(resolve(__dirname, '../../../.env'));
} catch {
  // no .env file — fine in production
}

/**
 * Build Order step 1 (CLAUDE.md): seed superadmin, one manager, credit
 * packs, payment methods. Dev-only — there is no UI that can create the
 * first Admin/Super Admin, same reasoning as the old docs/adr/0013 note this
 * replaces. Safe to run more than once: every insert is guarded by a lookup
 * on the row's natural key (email / name / type+label).
 *
 * Usage: pnpm db:seed
 */

const PRODUCTION = process.env.NODE_ENV === 'production';
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? (PRODUCTION ? '' : 'changeme123');
const SUPERADMIN_EMAIL = (process.env.SEED_SUPERADMIN_EMAIL ?? (PRODUCTION ? '' : 'superadmin@foxindex.dev')).trim().toLowerCase();

// Production never gets demo accounts or a guessable password.
if (PRODUCTION && (!SUPERADMIN_EMAIL || SEED_PASSWORD.length < 12 || SEED_PASSWORD === 'changeme123')) {
  console.error('In production set SEED_SUPERADMIN_EMAIL and a SEED_PASSWORD of at least 12 characters.');
  process.exit(1);
}

async function upsertStaffUser(
  db: Awaited<ReturnType<typeof createDbClient>>['db'],
  input: { name: string; email: string; role: 'superadmin' | 'manager' },
) {
  const [existing] = await db.select().from(users).where(eq(users.email, input.email));
  if (existing) {
    console.log(`  - ${input.role} ${input.email} already exists, skipping`);
    return existing;
  }

  const passwordHash = await argon2.hash(SEED_PASSWORD);
  const [created] = await db
    .insert(users)
    .values({
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
      status: 'active',
    })
    .returning();

  console.log(`  - created ${input.role} ${input.email}${PRODUCTION ? '' : ` (password: ${SEED_PASSWORD})`}`);
  return created;
}

async function main() {
  const connectionString = process.env.DATABASE_URL ?? 'postgres://foxindex:foxindex@localhost:5432/foxindex';
  const { db, pool } = createDbClient({ connectionString, ssl: process.env.DATABASE_SSL === 'true' });

  try {
    console.log('Seeding staff users...');
    await upsertStaffUser(db, { name: 'Super Admin', email: SUPERADMIN_EMAIL, role: 'superadmin' });
    if (!PRODUCTION) await upsertStaffUser(db, { name: 'Manager One', email: 'manager1@foxindex.dev', role: 'manager' });

    console.log('Seeding credit packs...');
    const packs: (typeof creditPacks.$inferInsert)[] = [
      { name: 'Starter', credits: 500, priceBdt: '990.00', priceUsd: '8.50' },
      { name: 'Agency', credits: 3000, priceBdt: '4290.00', priceUsd: '36.00', isFeatured: true },
      { name: 'API', credits: 10000, priceBdt: '10900.00', priceUsd: '92.00' },
      { name: 'Enterprise', credits: 50000, priceBdt: '44900.00', priceUsd: '380.00' },
    ];
    for (const pack of packs) {
      const [existing] = await db.select().from(creditPacks).where(eq(creditPacks.name, pack.name));
      if (existing) {
        console.log(`  - pack "${pack.name}" already exists, skipping`);
        continue;
      }
      await db.insert(creditPacks).values(pack);
      console.log(`  - created pack "${pack.name}" (${pack.credits} credits)`);
    }

    console.log('Seeding payment methods...');
    const methods: (typeof paymentMethods.$inferInsert)[] = [
      { type: 'gateway', label: 'bKash', network: 'bkash', isManual: false, gateway: 'aamarpay', sortOrder: 10 },
      { type: 'gateway', label: 'Nagad', network: 'nagad', isManual: false, gateway: 'aamarpay', sortOrder: 20 },
      { type: 'gateway', label: 'Rocket', network: 'rocket', isManual: false, gateway: 'aamarpay', sortOrder: 30 },
      {
        type: 'card',
        label: 'Visa / Mastercard / Amex',
        isManual: false,
        gateway: 'aamarpay',
        feePercent: '2.50',
        sortOrder: 40,
      },
      {
        type: 'bank',
        label: 'Bank transfer',
        accountName: 'FoxIndex Ltd',
        accountNumber: '1501 2034 5678 901',
        bankName: 'BRAC Bank',
        branch: 'Gulshan',
        instructions: 'Use the narration shown below so we can match your transfer.',
        isManual: true,
        sortOrder: 50,
      },
      {
        type: 'bkash',
        label: 'bKash personal',
        accountNumber: '01712 345 678',
        instructions: 'Use "Send money", not "Payment".',
        isManual: true,
        sortOrder: 60,
      },
    ];
    for (const method of methods) {
      const [existing] = await db
        .select()
        .from(paymentMethods)
        .where(eq(paymentMethods.label, method.label));
      if (existing) {
        console.log(`  - payment method "${method.label}" already exists, skipping`);
        continue;
      }
      await db.insert(paymentMethods).values(method);
      console.log(`  - created payment method "${method.label}"`);
    }

    console.log('Seeding indexing providers...');
    const providers: (typeof indexingProviders.$inferInsert)[] = [
      {
        kind: 'google_indexing',
        label: 'Google Indexing API',
        priority: 10,
        config: { description: 'Service accounts, round-robin', creditCost: 1, costUsd: 0 },
      },
      {
        kind: 'indexnow',
        label: 'IndexNow',
        priority: 20,
        config: { description: 'api.indexnow.org · Bing, Yandex, Naver, Seznam, Yep', creditCost: 0, costUsd: 0 },
      },
    ];
    for (const provider of providers) {
      const [existing] = await db.select().from(indexingProviders).where(eq(indexingProviders.label, provider.label));
      if (existing) {
        console.log(`  - provider "${provider.label}" already exists, skipping`);
        continue;
      }
      await db.insert(indexingProviders).values(provider);
      console.log(`  - created provider "${provider.label}"`);
    }

    console.log('Seed complete.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
