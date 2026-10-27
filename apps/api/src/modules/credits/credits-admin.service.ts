import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { creditTransactions, users, type Database } from '@foxindex/database';
import type { AdjustCreditsInput, CreditLedgerQuery, CreditSettings } from '@foxindex/validation';
import { UserRole } from '@foxindex/types';
import { AuthorizationError, NotFoundError, ValidationError } from '../../common/errors/app-error';
import { DATABASE } from '../../database/database.module';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreditSettingsService } from './credit-settings.service';
import { CreditsRepository } from './credits.repository';

type Actor = { id: string; role: UserRole };

/**
 * Staff-side credit management. Managers see and act on their own clients only,
 * within the limits the superadmin sets; admins see every client; nothing here
 * ever touches staff accounts' balances.
 */
@Injectable()
export class CreditsAdminService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CreditsRepository) private readonly credits: CreditsRepository,
    @Inject(CreditSettingsService) private readonly settings: CreditSettingsService,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  /** SQL condition limiting `u` (users) to the clients this actor may see. */
  private scope(actor: Actor) {
    return actor.role === UserRole.MANAGER ? sql`u.role = 'client' AND u.assigned_manager_id = ${actor.id}` : sql`u.role = 'client'`;
  }

  /** What this actor may still do today — shown next to the adjust form. */
  async limitsFor(actor: Actor, settings?: CreditSettings) {
    const s = settings ?? (await this.settings.get());
    if (actor.role === UserRole.SUPERADMIN) return { maxPerAdjustment: null, dailyLimit: null, usedToday: 0, canDeduct: true };
    if (actor.role === UserRole.ADMIN) return { maxPerAdjustment: s.adminMaxPerAdjustment, dailyLimit: null, usedToday: 0, canDeduct: true };
    const [{ used }] = await this.db
      .select({ used: sql<string>`coalesce(sum(abs(${creditTransactions.amount})), 0)` })
      .from(creditTransactions)
      .where(
        sql`${creditTransactions.performedBy} = ${actor.id} AND ${creditTransactions.type} IN ('manual_add', 'manual_deduct') AND ${creditTransactions.createdAt} >= date_trunc('day', now())`,
      );
    return { maxPerAdjustment: s.managerMaxPerAdjustment, dailyLimit: s.managerDailyLimit, usedToday: Number(used), canDeduct: s.managersCanDeduct };
  }

  async adjust(actor: Actor, targetUserId: string, input: AdjustCreditsInput) {
    const s = await this.settings.get();
    const limits = await this.limitsFor(actor, s);
    if (input.direction === 'deduct' && !limits.canDeduct) {
      throw new AuthorizationError('Account managers cannot remove credits — ask an admin');
    }
    if (limits.maxPerAdjustment !== null && input.amount > limits.maxPerAdjustment) {
      throw new ValidationError(`Your limit is ${limits.maxPerAdjustment.toLocaleString()} credits per adjustment — ask ${actor.role === UserRole.MANAGER ? 'an admin' : 'the superadmin'} for more`, {
        reason: 'ADJUSTMENT_LIMIT',
        limit: limits.maxPerAdjustment,
      });
    }

    const result = await this.db.transaction(async (tx) => {
      // Lock the client so a concurrent submit or adjustment can't race the balance check.
      const locked = await tx.execute<{ id: string; role: string; name: string; assigned_manager_id: string | null }>(
        sql`SELECT id, role, name, assigned_manager_id FROM ${users} WHERE id = ${targetUserId} FOR UPDATE`,
      );
      const target = locked.rows[0];
      if (!target || target.role !== UserRole.CLIENT) throw new NotFoundError('Client');
      if (actor.role === UserRole.MANAGER && target.assigned_manager_id !== actor.id) throw new NotFoundError('Client');

      if (limits.dailyLimit !== null) {
        // Re-read inside the transaction (serialized per manager by the advisory lock) so parallel requests can't overshoot.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`credit-adjust:${actor.id}`}))`);
        const [{ used }] = await tx
          .select({ used: sql<string>`coalesce(sum(abs(${creditTransactions.amount})), 0)` })
          .from(creditTransactions)
          .where(
            sql`${creditTransactions.performedBy} = ${actor.id} AND ${creditTransactions.type} IN ('manual_add', 'manual_deduct') AND ${creditTransactions.createdAt} >= date_trunc('day', now())`,
          );
        if (Number(used) + input.amount > limits.dailyLimit) {
          throw new ValidationError(`That would pass your daily limit of ${limits.dailyLimit.toLocaleString()} credits (${Number(used).toLocaleString()} used today)`, {
            reason: 'DAILY_ADJUSTMENT_LIMIT',
            limit: limits.dailyLimit,
            used: Number(used),
          });
        }
      }

      if (input.direction === 'deduct') {
        const [{ total }] = await tx
          .select({ total: sql<string>`coalesce(sum(${creditTransactions.amount}), 0)` })
          .from(creditTransactions)
          .where(sql`${creditTransactions.userId} = ${targetUserId}`);
        if (Number(total) < input.amount) {
          throw new ValidationError(`${target.name} only has ${Number(total).toLocaleString()} credits`, { reason: 'INSUFFICIENT_CREDITS', available: Number(total) });
        }
      }

      const signed = input.direction === 'add' ? input.amount : -input.amount;
      const balance = await this.credits.apply(targetUserId, signed, input.direction === 'add' ? 'manual_add' : 'manual_deduct', {
        performedBy: actor.id,
        note: input.reason,
        tx,
      });
      await this.auditLog.record(
        {
          actorId: actor.id,
          action: input.direction === 'add' ? 'credits.manual_grant' : 'credits.manual_deduct',
          targetType: 'user',
          targetId: targetUserId,
          metadata: { amount: input.amount, note: input.reason, balance },
        },
        tx,
      );
      return { balance };
    });

    this.notifications.notify({
      userId: targetUserId,
      type: 'credits.adjusted',
      title: input.direction === 'add' ? `${input.amount.toLocaleString()} credits added to your account` : `${input.amount.toLocaleString()} credits removed from your account`,
      body: input.reason,
      link: '/billing',
    });
    return { userId: targetUserId, balance: result.balance };
  }

  async overview(actor: Actor) {
    const scope = this.scope(actor);
    const result = await this.db.execute<Record<string, string | null>>(sql`
      SELECT
        coalesce(sum(ct.amount), 0) AS outstanding,
        coalesce(sum(ct.amount) FILTER (WHERE ct.type IN ('manual_add', 'payment_credit', 'signup_bonus') AND ct.created_at >= date_trunc('month', now())), 0) AS issued_month,
        coalesce(sum(ct.amount) FILTER (WHERE ct.type = 'payment_credit' AND ct.created_at >= date_trunc('month', now())), 0) AS purchased_month,
        coalesce(-sum(ct.amount) FILTER (WHERE ct.type = 'submission_deduct' AND ct.created_at >= date_trunc('month', now())), 0) AS used_month,
        coalesce(sum(ct.amount) FILTER (WHERE ct.type = 'refund' AND ct.created_at >= date_trunc('month', now())), 0) AS refunded_month,
        coalesce(-sum(ct.amount) FILTER (WHERE ct.type = 'manual_deduct' AND ct.created_at >= date_trunc('month', now())), 0) AS deducted_month,
        coalesce(-sum(ct.amount) FILTER (WHERE ct.type = 'submission_deduct' AND ct.created_at >= date_trunc('day', now())), 0) AS used_today
      FROM ${creditTransactions} ct JOIN ${users} u ON u.id = ct.user_id
      WHERE ${scope}
    `);
    const low = await this.db.execute<{ id: string; name: string; email: string; balance: string }>(sql`
      SELECT u.id, u.name, u.email, coalesce(sum(ct.amount), 0) AS balance
      FROM ${users} u LEFT JOIN ${creditTransactions} ct ON ct.user_id = u.id
      WHERE ${scope} AND u.status = 'active'
      GROUP BY u.id
      HAVING coalesce(sum(ct.amount), 0) < 50
      ORDER BY balance ASC, u.name
      LIMIT 8
    `);
    const r = result.rows[0] ?? {};
    const n = (k: string) => Number(r[k] ?? 0);
    const settings = await this.settings.get();
    return {
      outstanding: n('outstanding'),
      issuedThisMonth: n('issued_month'),
      purchasedThisMonth: n('purchased_month'),
      usedThisMonth: n('used_month'),
      usedToday: n('used_today'),
      refundedThisMonth: n('refunded_month'),
      deductedThisMonth: n('deducted_month'),
      lowBalance: low.rows.map((x) => ({ id: x.id, name: x.name, email: x.email, balance: Number(x.balance) })),
      settings,
      limits: await this.limitsFor(actor, settings),
    };
  }

  async ledger(actor: Actor, query: CreditLedgerQuery) {
    const like = query.q ? `%${query.q.replace(/[%_\\]/g, '\\$&')}%` : null;
    const result = await this.db.execute<{
      id: string;
      amount: number;
      type: string;
      note: string | null;
      reference_id: string | null;
      created_at: string;
      user_id: string;
      user_name: string;
      user_email: string;
      performer_name: string | null;
      performer_role: string | null;
    }>(sql`
      SELECT ct.id, ct.amount, ct.type, ct.note, ct.reference_id, ct.created_at,
             u.id AS user_id, u.name AS user_name, u.email AS user_email,
             p.name AS performer_name, p.role AS performer_role
      FROM ${creditTransactions} ct
      JOIN ${users} u ON u.id = ct.user_id
      LEFT JOIN ${users} p ON p.id = ct.performed_by
      WHERE ${this.scope(actor)}
        ${query.type ? sql`AND ct.type = ${query.type}` : sql``}
        ${query.userId ? sql`AND ct.user_id = ${query.userId}` : sql``}
        ${like ? sql`AND (u.name ILIKE ${like} OR u.email ILIKE ${like} OR ct.note ILIKE ${like})` : sql``}
        ${query.before ? sql`AND ct.created_at < ${query.before}` : sql``}
      ORDER BY ct.created_at DESC, ct.id DESC
      LIMIT ${query.limit}
    `);
    return result.rows.map((r) => ({
      id: r.id,
      amount: Number(r.amount),
      type: r.type,
      note: r.note,
      referenceId: r.reference_id,
      createdAt: new Date(r.created_at).toISOString(),
      user: { id: r.user_id, name: r.user_name, email: r.user_email },
      // Admins never see superadmin identities; the action still shows as staff.
      performedBy: r.performer_name ? (r.performer_role === UserRole.SUPERADMIN && actor.role !== UserRole.SUPERADMIN ? 'FoxIndex team' : r.performer_name) : null,
    }));
  }
}
