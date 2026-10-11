import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { ticketMacros, users, type Database } from '@foxindex/database';
import type { UpsertMacroInput } from '@foxindex/validation';
import { AuthorizationError, NotFoundError } from '../../common/errors/app-error';
import { DATABASE } from '../../database/database.module';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { isAdmin, isStaff, type TicketActor } from './ticket-scope';

/**
 * Canned replies. Shared macros (ownerId null) are visible to every agent and
 * editable by admins; personal macros only by their owner.
 */
@Injectable()
export class MacrosService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
  ) {}

  async list(actor: TicketActor) {
    if (!isStaff(actor)) throw new AuthorizationError();
    const rows = await this.db
      .select({ m: ticketMacros, createdByName: users.name })
      .from(ticketMacros)
      .leftJoin(users, eq(users.id, ticketMacros.createdBy))
      .where(or(isNull(ticketMacros.ownerId), eq(ticketMacros.ownerId, actor.id)))
      .orderBy(desc(ticketMacros.usageCount), ticketMacros.title);
    return rows.map(({ m, createdByName }) => ({
      id: m.id,
      title: m.title,
      body: m.body,
      actions: m.actions,
      shared: m.ownerId === null,
      usageCount: m.usageCount,
      createdByName,
      updatedAt: m.updatedAt,
      canEdit: m.ownerId === actor.id || (m.ownerId === null && isAdmin(actor)),
    }));
  }

  async create(actor: TicketActor, input: UpsertMacroInput) {
    if (!isStaff(actor)) throw new AuthorizationError();
    if (input.shared && !isAdmin(actor)) throw new AuthorizationError('Only admins can create shared macros');
    const [row] = await this.db
      .insert(ticketMacros)
      .values({ title: input.title, body: input.body, actions: input.actions, ownerId: input.shared ? null : actor.id, createdBy: actor.id })
      .returning();
    await this.auditLog.record({ actorId: actor.id, action: 'macro.create', targetType: 'ticket_macro', targetId: row.id, metadata: { title: row.title, shared: input.shared } });
    return row;
  }

  private async editable(actor: TicketActor, id: string) {
    const m = await this.db.query.ticketMacros.findFirst({ where: eq(ticketMacros.id, id) });
    if (!m || (m.ownerId !== null && m.ownerId !== actor.id)) throw new NotFoundError('Macro');
    if (m.ownerId === null && !isAdmin(actor)) throw new AuthorizationError('Only admins can change shared macros');
    return m;
  }

  async update(actor: TicketActor, id: string, input: UpsertMacroInput) {
    await this.editable(actor, id);
    if (input.shared && !isAdmin(actor)) throw new AuthorizationError('Only admins can share macros');
    const [row] = await this.db
      .update(ticketMacros)
      .set({ title: input.title, body: input.body, actions: input.actions, ownerId: input.shared ? null : actor.id, updatedAt: new Date() })
      .where(eq(ticketMacros.id, id))
      .returning();
    await this.auditLog.record({ actorId: actor.id, action: 'macro.update', targetType: 'ticket_macro', targetId: id, metadata: { title: input.title } });
    return row;
  }

  async remove(actor: TicketActor, id: string) {
    const m = await this.editable(actor, id);
    await this.db.delete(ticketMacros).where(and(eq(ticketMacros.id, id)));
    await this.auditLog.record({ actorId: actor.id, action: 'macro.delete', targetType: 'ticket_macro', targetId: id, metadata: { title: m.title } });
    return { ok: true };
  }
}
