import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import { creditPacks, paymentMethods, payments, type Database } from '@foxindex/database';
import type { UpsertCreditPackInput, UpsertPaymentMethodInput } from '@foxindex/validation';
import { NotFoundError } from '../../common/errors/app-error';
import { DATABASE } from '../../database/database.module';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { AamarPayClient } from './aamarpay.client';

/** Superadmin-only catalog management: packs, payment methods, gateway status. */
@Injectable()
export class BillingConfigService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
    @Inject(AamarPayClient) private readonly aamarpay: AamarPayClient,
  ) {}

  async listPacks() {
    const sold = await this.db.execute<{ pack_id: string; n: string }>(sql`
      SELECT pack_id, count(*) AS n FROM ${payments}
      WHERE status = 'approved' AND pack_id IS NOT NULL AND reviewed_at >= now() - interval '30 days'
      GROUP BY pack_id
    `);
    const soldBy = new Map(sold.rows.map((r) => [r.pack_id, Number(r.n)]));
    const rows = await this.db.select().from(creditPacks).orderBy(asc(creditPacks.credits));
    return rows.map((p) => ({ ...p, priceBdt: Number(p.priceBdt ?? 0), priceUsd: Number(p.priceUsd ?? 0), sold30d: soldBy.get(p.id) ?? 0 }));
  }

  async createPack(actorId: string, input: UpsertCreditPackInput) {
    const [row] = await this.db
      .insert(creditPacks)
      .values({ ...input, priceBdt: input.priceBdt.toFixed(2), priceUsd: input.priceUsd.toFixed(2) })
      .returning();
    await this.auditLog.record({ actorId, action: 'pack.create', targetType: 'credit_pack', targetId: row.id, metadata: { name: row.name } });
    return row;
  }

  async updatePack(actorId: string, id: string, input: Partial<UpsertCreditPackInput>) {
    const [row] = await this.db
      .update(creditPacks)
      .set({
        ...input,
        priceBdt: input.priceBdt === undefined ? undefined : input.priceBdt.toFixed(2),
        priceUsd: input.priceUsd === undefined ? undefined : input.priceUsd.toFixed(2),
      })
      .where(eq(creditPacks.id, id))
      .returning();
    if (!row) throw new NotFoundError('Credit pack');
    await this.auditLog.record({ actorId, action: 'pack.update', targetType: 'credit_pack', targetId: id, metadata: input });
    return row;
  }

  async listMethods() {
    const rows = await this.db.select().from(paymentMethods).orderBy(asc(paymentMethods.sortOrder));
    return rows.map(({ gatewayConfig: _gatewayConfig, ...m }) => ({ ...m, feePercent: Number(m.feePercent) }));
  }

  async createMethod(actorId: string, input: UpsertPaymentMethodInput) {
    const [row] = await this.db
      .insert(paymentMethods)
      .values({ ...input, feePercent: input.feePercent.toFixed(2) })
      .returning();
    await this.auditLog.record({ actorId, action: 'payment_method.create', targetType: 'payment_method', targetId: row.id, metadata: { label: row.label } });
    return row;
  }

  async updateMethod(actorId: string, id: string, input: Partial<UpsertPaymentMethodInput>) {
    const [row] = await this.db
      .update(paymentMethods)
      .set({ ...input, feePercent: input.feePercent === undefined ? undefined : input.feePercent.toFixed(2) })
      .where(eq(paymentMethods.id, id))
      .returning();
    if (!row) throw new NotFoundError('Payment method');
    await this.auditLog.record({ actorId, action: 'payment_method.update', targetType: 'payment_method', targetId: id, metadata: input });
    return row;
  }

  /** Gateway secrets live in the environment, so this only reports status — it never returns keys. */
  async gateways() {
    const cfg = this.aamarpay.config();
    const stats = await this.db.execute<{ total: string; approved: string; abandoned_today: string; last_at: string | null }>(sql`
      SELECT count(*) AS total,
             count(*) FILTER (WHERE p.status = 'approved') AS approved,
             count(*) FILTER (WHERE p.status IN ('pending','expired','rejected') AND p.created_at >= date_trunc('day', now())) AS abandoned_today,
             max(p.reviewed_at) FILTER (WHERE p.status = 'approved') AS last_at
      FROM ${payments} p JOIN ${paymentMethods} m ON m.id = p.method_id
      WHERE m.gateway = 'aamarpay' AND p.created_at >= date_trunc('month', now())
    `);
    const s = stats.rows[0];
    const total = Number(s?.total ?? 0);
    return [
      {
        id: 'aamarpay',
        name: 'aamarPay',
        covers: 'bKash, Nagad, Rocket, Upay, cards, net banking',
        configured: cfg !== null,
        mode: cfg ? (cfg.sandbox ? 'sandbox' : 'live') : 'off',
        storeId: cfg ? `${cfg.storeId.slice(0, 3)}…` : null,
        successRate: total > 0 ? Number(s?.approved ?? 0) / total : null,
        abandonedToday: Number(s?.abandoned_today ?? 0),
        lastSuccessAt: s?.last_at ? new Date(s.last_at).toISOString() : null,
      },
    ];
  }
}
