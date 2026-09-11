import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { Database, Transaction } from '@foxindex/database';
import { creditLedger, organizations } from '@foxindex/database';
import { CreditLedgerReason } from '@foxindex/types';
import { NotFoundError } from '../../common/errors/app-error';
import { DATABASE } from '../../database/database.module';

type Executor = Database | Transaction;

@Injectable()
export class CreditsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * A single conditional UPDATE (balance decrement + floor check in one
   * round trip) plus a ledger row, both against `tx` if the caller is
   * already inside one, or a fresh self-opened transaction otherwise.
   * Returns the new balance, or null if the balance was insufficient — no
   * SELECT-then-UPDATE race, no partial state either way. See docs/adr/0011
   * for why this has to compose into a caller's transaction rather than
   * always committing on its own.
   */
  async deduct(
    organizationId: string,
    amount: number,
    reason: CreditLedgerReason,
    metadata?: Record<string, unknown>,
    tx?: Executor,
  ): Promise<number | null> {
    const run = async (executor: Executor): Promise<number | null> => {
      const [updated] = await executor
        .update(organizations)
        .set({ creditBalance: sql`${organizations.creditBalance} - ${amount}`, updatedAt: new Date() })
        .where(and(eq(organizations.id, organizationId), gte(organizations.creditBalance, amount)))
        .returning({ creditBalance: organizations.creditBalance });

      if (!updated) return null;

      await executor
        .insert(creditLedger)
        .values({ organizationId, delta: -amount, reason, metadata: metadata ?? null });

      return updated.creditBalance;
    };

    return tx ? run(tx) : this.db.transaction((innerTx) => run(innerTx));
  }

  /** Same shape as deduct(), no floor check — throws if the org doesn't exist. */
  async grant(
    organizationId: string,
    amount: number,
    reason: CreditLedgerReason,
    metadata?: Record<string, unknown>,
    tx?: Executor,
  ): Promise<number> {
    const run = async (executor: Executor): Promise<number> => {
      const [updated] = await executor
        .update(organizations)
        .set({ creditBalance: sql`${organizations.creditBalance} + ${amount}`, updatedAt: new Date() })
        .where(eq(organizations.id, organizationId))
        .returning({ creditBalance: organizations.creditBalance });

      if (!updated) throw new NotFoundError('Organization');

      await executor
        .insert(creditLedger)
        .values({ organizationId, delta: amount, reason, metadata: metadata ?? null });

      return updated.creditBalance;
    };

    return tx ? run(tx) : this.db.transaction((innerTx) => run(innerTx));
  }

  async getBalance(organizationId: string): Promise<number | null> {
    const row = await this.db.query.organizations.findFirst({
      where: eq(organizations.id, organizationId),
      columns: { creditBalance: true },
    });
    return row?.creditBalance ?? null;
  }

  recentLedger(organizationId: string, limit = 20) {
    return this.db.query.creditLedger.findMany({
      where: eq(creditLedger.organizationId, organizationId),
      orderBy: desc(creditLedger.createdAt),
      limit,
    });
  }
}
