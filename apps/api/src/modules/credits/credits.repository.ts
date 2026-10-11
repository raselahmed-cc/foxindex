import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import type { Database, Transaction } from '@foxindex/database';
import { creditTransactions, users } from '@foxindex/database';
import { NotFoundError } from '../../common/errors/app-error';
import { DATABASE } from '../../database/database.module';

type Executor = Database | Transaction;
export type CreditTransactionType = (typeof creditTransactions.$inferInsert)['type'];

export interface GrantOptions {
  performedBy?: string;
  note?: string;
  referenceId?: string;
  tx?: Executor;
}

export interface LedgerRow {
  id: string;
  amount: number;
  type: CreditTransactionType;
  note: string | null;
  referenceId: string | null;
  performedById: string | null;
  performedByName: string | null;
  createdAt: string;
  balanceAfter: number;
}

@Injectable()
export class CreditsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Balance is always SUM(credit_transactions.amount) — never a column that
   * gets edited directly. `users.credit_balance_cached` is kept in step with
   * every grant as a cheap read-path snapshot; this query is the source of truth.
   */
  async getBalance(userId: string): Promise<number | null> {
    const user = await this.db.query.users.findFirst({ where: eq(users.id, userId), columns: { id: true } });
    if (!user) return null;

    const [row] = await this.db
      .select({ total: sql<string>`coalesce(sum(${creditTransactions.amount}), 0)` })
      .from(creditTransactions)
      .where(eq(creditTransactions.userId, userId));
    return Number(row?.total ?? 0);
  }

  async getStats(userId: string) {
    const result = await this.db.execute<{
      used_all_time: string;
      used_this_week: string;
      refunded: string;
      used_last_14d: string;
    }>(sql`
      SELECT
        coalesce(-sum(amount) FILTER (WHERE type = 'submission_deduct'), 0) AS used_all_time,
        coalesce(-sum(amount) FILTER (WHERE type = 'submission_deduct' AND created_at >= now() - interval '7 days'), 0) AS used_this_week,
        coalesce(-sum(amount) FILTER (WHERE type = 'submission_deduct' AND created_at >= now() - interval '14 days'), 0) AS used_last_14d,
        coalesce(sum(amount) FILTER (WHERE type = 'refund'), 0) AS refunded
      FROM ${creditTransactions}
      WHERE user_id = ${userId}
    `);
    const row = result.rows[0];
    return {
      usedAllTime: Number(row?.used_all_time ?? 0),
      usedThisWeek: Number(row?.used_this_week ?? 0),
      dailyBurn: Number(row?.used_last_14d ?? 0) / 14,
      refunded: Number(row?.refunded ?? 0),
    };
  }

  /** Newest first, with the running balance after each entry computed by a window over the full ledger. */
  async ledger(
    userId: string,
    opts: { limit: number; offset: number; type?: CreditTransactionType; sinceDays?: number },
  ): Promise<{ rows: LedgerRow[]; total: number }> {
    const typeFilter = opts.type ? sql`AND l.type = ${opts.type}` : sql``;
    const sinceFilter = opts.sinceDays ? sql`AND l.created_at >= now() - make_interval(days => ${opts.sinceDays})` : sql``;

    const result = await this.db.execute<{
      id: string;
      amount: number;
      type: CreditTransactionType;
      note: string | null;
      reference_id: string | null;
      performed_by: string | null;
      performer_name: string | null;
      created_at: string;
      balance_after: string;
      total_count: string;
    }>(sql`
      WITH l AS (
        SELECT ct.*,
               sum(ct.amount) OVER (ORDER BY ct.created_at, ct.id ROWS UNBOUNDED PRECEDING) AS balance_after
        FROM ${creditTransactions} ct
        WHERE ct.user_id = ${userId}
      )
      SELECT l.id, l.amount, l.type, l.note, l.reference_id, l.performed_by, l.created_at, l.balance_after,
             u.name AS performer_name,
             count(*) OVER () AS total_count
      FROM l
      LEFT JOIN ${users} u ON u.id = l.performed_by
      WHERE true ${typeFilter} ${sinceFilter}
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT ${opts.limit} OFFSET ${opts.offset}
    `);

    return {
      total: Number(result.rows[0]?.total_count ?? 0),
      rows: result.rows.map((r) => ({
        id: r.id,
        amount: Number(r.amount),
        type: r.type,
        note: r.note,
        referenceId: r.reference_id,
        performedById: r.performed_by,
        performedByName: r.performer_name,
        createdAt: new Date(r.created_at).toISOString(),
        balanceAfter: Number(r.balance_after),
      })),
    };
  }

  recentTransactions(userId: string, limit = 20) {
    return this.db.query.creditTransactions.findMany({
      where: eq(creditTransactions.userId, userId),
      orderBy: desc(creditTransactions.createdAt),
      limit,
    });
  }

  /** Ledger insert + cached-column update in one transaction (docs/adr/0011). Returns the new cached balance. */
  async grant(
    userId: string,
    amount: number,
    type: CreditTransactionType,
    performedBy?: string,
    note?: string,
    tx?: Executor,
    referenceId?: string,
  ): Promise<number> {
    return this.apply(userId, amount, type, { performedBy, note, tx, referenceId });
  }

  async apply(userId: string, amount: number, type: CreditTransactionType, opts: GrantOptions = {}): Promise<number> {
    const run = async (executor: Executor): Promise<number> => {
      const [updated] = await executor
        .update(users)
        .set({ creditBalanceCached: sql`${users.creditBalanceCached} + ${amount}`, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning({ creditBalanceCached: users.creditBalanceCached });

      if (!updated) throw new NotFoundError('User');

      await executor.insert(creditTransactions).values({
        userId,
        amount,
        type,
        performedBy: opts.performedBy,
        note: opts.note,
        referenceId: opts.referenceId,
      });

      return updated.creditBalanceCached;
    };

    return opts.tx ? run(opts.tx) : this.db.transaction((innerTx) => run(innerTx));
  }
}
