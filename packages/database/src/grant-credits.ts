import { resolve } from 'node:path';
import { config } from 'dotenv';
import { eq, sql } from 'drizzle-orm';
import { CreditLedgerReason } from '@foxindex/types';
import { createDbClient } from './client';
import { creditLedger, organizations } from './schema';

config({ path: resolve(__dirname, '../../../.env'), quiet: true });

/**
 * Dev-only credit top-up — there is deliberately no API endpoint for this
 * (see docs/adr/0011): a self-serve "grant yourself free credits" button
 * would be a fake feature shipped in a real product surface. This duplicates
 * apps/api's CreditsRepository.grant()'s shape rather than importing it —
 * packages can't depend on apps — keep the two in sync if that shape changes.
 *
 * Usage: pnpm credits:grant <organizationId-or-slug> <amount>
 */
async function main() {
  const [orgIdOrSlug, amountArg] = process.argv.slice(2);
  if (!orgIdOrSlug || !amountArg) {
    throw new Error('Usage: pnpm credits:grant <organizationId-or-slug> <amount>');
  }
  const amount = Number(amountArg);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`Amount must be a positive integer, got: ${amountArg}`);
  }

  const connectionString =
    process.env.DATABASE_URL ?? 'postgres://foxindex:foxindex@localhost:5432/foxindex';
  const { db, pool } = createDbClient({ connectionString });

  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgIdOrSlug);

    const newBalance = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(organizations)
        .set({ creditBalance: sql`${organizations.creditBalance} + ${amount}`, updatedAt: new Date() })
        .where(isUuid ? eq(organizations.id, orgIdOrSlug) : eq(organizations.slug, orgIdOrSlug))
        .returning({ id: organizations.id, creditBalance: organizations.creditBalance });

      if (!updated) throw new Error(`No organization found for "${orgIdOrSlug}"`);

      await tx.insert(creditLedger).values({
        organizationId: updated.id,
        delta: amount,
        reason: CreditLedgerReason.MANUAL_GRANT,
      });

      return updated.creditBalance;
    });

    console.log(`Granted ${amount} credits to ${orgIdOrSlug}. New balance: ${newBalance}.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Grant failed:', error);
  process.exit(1);
});
