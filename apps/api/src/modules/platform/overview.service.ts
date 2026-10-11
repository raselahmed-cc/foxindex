import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { UserRole } from '@foxindex/types';
import type IORedis from 'ioredis';
import { auditLogs, payments, urlSubmissions, users, type Database } from '@foxindex/database';
import type { AuditLogQuery } from '@foxindex/validation';
import { DATABASE } from '../../database/database.module';
import { REDIS_CONNECTION } from '../../redis/redis.module';

@Injectable()
export class OverviewService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(REDIS_CONNECTION) private readonly redis: IORedis,
  ) {}

  async overview(viewerRole: UserRole = UserRole.SUPERADMIN) {
    const [kpis, series, managers, attention, recentAudit, health] = await Promise.all([
      this.kpis(),
      this.series(),
      this.managers(),
      this.attention(),
      this.auditLog({ limit: 6 }, viewerRole),
      this.health(),
    ]);
    return { kpis, series, managers, attention, recentAudit, health };
  }

  private async kpis() {
    const r = await this.db.execute<{
      revenue_month: string;
      revenue_prev: string;
      payments_month: string;
      urls_today: string;
      indexed_today: string;
      active_clients: string;
      new_clients_week: string;
      pending_approval: string;
    }>(sql`
      SELECT
        (SELECT coalesce(sum(amount),0) FROM ${payments} WHERE status='approved' AND currency='BDT' AND reviewed_at >= date_trunc('month', now())) AS revenue_month,
        (SELECT coalesce(sum(amount),0) FROM ${payments} WHERE status='approved' AND currency='BDT' AND reviewed_at >= date_trunc('month', now()) - interval '1 month' AND reviewed_at < date_trunc('month', now())) AS revenue_prev,
        (SELECT count(*) FROM ${payments} WHERE status='approved' AND reviewed_at >= date_trunc('month', now())) AS payments_month,
        (SELECT count(*) FROM ${urlSubmissions} WHERE created_at >= date_trunc('day', now())) AS urls_today,
        (SELECT count(*) FROM ${urlSubmissions} WHERE created_at >= date_trunc('day', now()) AND status='indexed') AS indexed_today,
        (SELECT count(*) FROM ${users} WHERE role='client' AND status='active') AS active_clients,
        (SELECT count(*) FROM ${users} WHERE role='client' AND created_at >= now() - interval '7 days') AS new_clients_week,
        (SELECT count(*) FROM ${users} WHERE role='client' AND status='pending_approval') AS pending_approval
    `);
    const k = r.rows[0];
    const month = Number(k.revenue_month);
    const prev = Number(k.revenue_prev);
    return {
      revenueBdtMonth: month,
      revenueChange: prev > 0 ? (month - prev) / prev : null,
      paymentsMonth: Number(k.payments_month),
      urlsToday: Number(k.urls_today),
      indexedToday: Number(k.indexed_today),
      activeClients: Number(k.active_clients),
      newClientsWeek: Number(k.new_clients_week),
      pendingApproval: Number(k.pending_approval),
    };
  }

  /** Last 30 days, zero-filled so the chart always has 30 bars. */
  private async series() {
    const r = await this.db.execute<{ day: string; urls: string; revenue: string }>(sql`
      WITH days AS (SELECT generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') AS day)
      SELECT d.day,
        (SELECT count(*) FROM ${urlSubmissions} s WHERE s.created_at >= d.day AND s.created_at < d.day + interval '1 day') AS urls,
        (SELECT coalesce(sum(p.amount),0) FROM ${payments} p WHERE p.status='approved' AND p.currency='BDT' AND p.reviewed_at >= d.day AND p.reviewed_at < d.day + interval '1 day') AS revenue
      FROM days d ORDER BY d.day
    `);
    return r.rows.map((row) => ({ day: new Date(row.day).toISOString().slice(0, 10), urls: Number(row.urls), revenueBdt: Number(row.revenue) }));
  }

  private async managers() {
    const r = await this.db.execute<{ id: string; name: string; clients: string; pending_payments: string; status: string }>(sql`
      SELECT m.id, m.name, m.status,
        (SELECT count(*) FROM ${users} c WHERE c.assigned_manager_id = m.id AND c.status='active') AS clients,
        (SELECT count(*) FROM ${payments} p JOIN ${users} c ON c.id = p.user_id WHERE c.assigned_manager_id = m.id AND p.status='under_review') AS pending_payments
      FROM ${users} m WHERE m.role='manager' ORDER BY clients DESC LIMIT 8
    `);
    return r.rows.map((m) => ({ id: m.id, name: m.name, status: m.status, clients: Number(m.clients), pendingPayments: Number(m.pending_payments) }));
  }

  private async attention() {
    const items: { kind: string; severity: 'bad' | 'warn' | 'info'; title: string; detail: string; href: string }[] = [];

    const stale = await this.db
      .select({ n: sql<string>`count(*)` })
      .from(payments)
      .where(and(eq(payments.status, 'under_review'), lt(payments.createdAt, sql`now() - interval '3 hours'`)));
    const staleCount = Number(stale[0]?.n ?? 0);
    if (staleCount > 0) {
      items.push({ kind: 'payments', severity: 'warn', title: `${staleCount} manual payment${staleCount > 1 ? 's' : ''}`, detail: 'waiting over 3 hours', href: '/admin/payments' });
    }

    const unassigned = await this.db
      .select({ n: sql<string>`count(*)` })
      .from(users)
      .where(and(eq(users.role, 'client'), eq(users.status, 'pending_approval'), sql`${users.assignedManagerId} IS NULL`));
    const unassignedCount = Number(unassigned[0]?.n ?? 0);
    if (unassignedCount > 0) {
      items.push({ kind: 'approval', severity: 'info', title: `${unassignedCount} account${unassignedCount > 1 ? 's' : ''}`, detail: 'pending approval with no manager', href: '/admin/users?status=pending_approval' });
    }

    const failing = await this.db
      .select({ n: sql<string>`count(*)` })
      .from(urlSubmissions)
      .where(and(eq(urlSubmissions.status, 'failed'), gte(urlSubmissions.createdAt, sql`now() - interval '24 hours'`)));
    const failingCount = Number(failing[0]?.n ?? 0);
    if (failingCount > 20) {
      items.push({ kind: 'submissions', severity: 'bad', title: `${failingCount} failed submissions`, detail: 'in the last 24 hours', href: '/admin/providers' });
    }
    return items;
  }

  private async health() {
    const started = Date.now();
    await this.db.execute(sql`SELECT 1`);
    const dbMs = Date.now() - started;
    const redisStarted = Date.now();
    await this.redis.ping();
    const redisMs = Date.now() - redisStarted;
    return {
      databaseMs: dbMs,
      redisMs,
      aamarpayConfigured: Boolean(process.env.AAMARPAY_STORE_ID && process.env.AAMARPAY_SIGNATURE_KEY),
      smtpConfigured: Boolean(process.env.SMTP_HOST),
    };
  }

  /** Admins don't see what superadmins did, nor entries about superadmin accounts. */
  async auditLog(query: Partial<AuditLogQuery>, viewerRole: UserRole = UserRole.SUPERADMIN) {
    const hideSuperadmin = viewerRole !== UserRole.SUPERADMIN;
    const rows = await this.db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        targetType: auditLogs.targetType,
        targetId: auditLogs.targetId,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
        actorId: auditLogs.actorId,
        actorName: users.name,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorId))
      .where(
        and(
          query.before ? lt(auditLogs.createdAt, new Date(query.before)) : undefined,
          query.action ? sql`${auditLogs.action} ILIKE ${query.action + '%'}` : undefined,
          hideSuperadmin ? sql`(${users.role} IS NULL OR ${users.role} <> 'superadmin')` : undefined,
          hideSuperadmin ? sql`NOT (${auditLogs.targetType} = 'user' AND ${auditLogs.targetId} IN (SELECT id FROM ${users} WHERE role = 'superadmin'))` : undefined,
        ),
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(query.limit ?? 50);
    return rows;
  }
}
