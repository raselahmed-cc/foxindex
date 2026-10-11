import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { hashPassword, type Mailer } from '@foxindex/auth';
import { sessions, users, type Database } from '@foxindex/database';
import type { InviteStaffInput, UpdateStaffInput } from '@foxindex/validation';
import { UserRole } from '@foxindex/types';
import { AuthorizationError, NotFoundError, ValidationError } from '../../common/errors/app-error';
import { DATABASE } from '../../database/database.module';
import { MAILER } from '../auth/mailer.provider';
import { AuditLogService } from '../audit-logs/audit-log.service';

const STAFF_ROLES = ['manager', 'admin', 'superadmin'] as const;

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
  ) {}

  async list() {
    const result = await this.db.execute<{
      id: string;
      name: string;
      email: string;
      role: string;
      status: string;
      max_clients: number | null;
      created_at: string;
      clients: string;
      last_active: string | null;
    }>(sql`
      SELECT u.id, u.name, u.email, u.role, u.status, u.max_clients, u.created_at,
             (SELECT count(*) FROM ${users} c WHERE c.assigned_manager_id = u.id AND c.status = 'active') AS clients,
             (SELECT max(s.created_at) FROM ${sessions} s WHERE s.user_id = u.id) AS last_active
      FROM ${users} u
      WHERE u.role IN ('manager','admin','superadmin')
      ORDER BY CASE u.role WHEN 'superadmin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.created_at
    `);
    return result.rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      status: r.status,
      maxClients: r.max_clients,
      clients: Number(r.clients),
      lastActiveAt: r.last_active ? new Date(r.last_active).toISOString() : null,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  /** Creates the account active with a one-time temporary password emailed to the invitee. */
  async invite(actorId: string, input: InviteStaffInput) {
    const existing = await this.db.query.users.findFirst({ where: eq(users.email, input.email), columns: { id: true } });
    if (existing) throw new ValidationError('Someone already uses that email', { reason: 'EMAIL_ALREADY_REGISTERED' });

    const tempPassword = input.password ?? randomBytes(12).toString('base64url');
    const [row] = await this.db
      .insert(users)
      .values({
        name: input.name,
        email: input.email,
        passwordHash: await hashPassword(tempPassword),
        role: input.role,
        status: 'active',
        maxClients: input.role === 'manager' ? (input.maxClients ?? null) : null,
      })
      .returning({ id: users.id });

    await this.auditLog.record({ actorId, action: 'staff.invite', targetType: 'user', targetId: row.id, metadata: { email: input.email, role: input.role } });

    const appUrl = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
    let emailSent = false;
    try {
      await this.mailer.send(
        input.email,
        'You have been invited to FoxIndex',
        `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px">
          <h2>Welcome to FoxIndex, ${escape(input.name)}</h2>
          <p>You were added as <b>${escape(input.role)}</b>. Sign in at <a href="${appUrl}/login">${appUrl}/login</a> with:</p>
          <p>Email: <b>${escape(input.email)}</b><br>Temporary password: <b>${tempPassword}</b></p>
          <p>Change it right away under Settings → Security.</p></div>`,
      );
      emailSent = true;
    } catch (error) {
      this.logger.warn(`staff invite email failed: ${(error as Error).message}`);
    }
    // Returned once so the inviter can hand the login over even if email isn't configured or fails.
    return { id: row.id, email: input.email, password: tempPassword, emailSent };
  }

  async update(actor: { id: string; role: UserRole }, targetId: string, input: UpdateStaffInput) {
    if (targetId === actor.id && (input.role || input.status)) {
      throw new AuthorizationError('You cannot change your own role or status');
    }
    const target = await this.db.query.users.findFirst({ where: eq(users.id, targetId) });
    if (!target || !(STAFF_ROLES as readonly string[]).includes(target.role)) throw new NotFoundError('Staff member');

    if (target.role === 'superadmin' && (input.role && input.role !== 'superadmin' || input.status === 'suspended')) {
      const others = await this.db.query.users.findMany({
        where: and(eq(users.role, 'superadmin'), eq(users.status, 'active'), ne(users.id, targetId)),
        columns: { id: true },
      });
      if (others.length === 0) throw new ValidationError('There must always be at least one active superadmin', { reason: 'LAST_SUPERADMIN' });
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ role: input.role, status: input.status, maxClients: input.maxClients, updatedAt: new Date() })
        .where(eq(users.id, targetId));
      if (input.status === 'suspended' || (input.role && input.role !== target.role)) {
        // Force re-login so the new role/status is reflected in the next access token.
        await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, targetId), isNull(sessions.revokedAt)));
      }
      if (input.status === 'suspended' && target.role === 'manager') {
        await tx.update(users).set({ assignedManagerId: null }).where(eq(users.assignedManagerId, targetId));
      }
      await this.auditLog.record({ actorId: actor.id, action: 'staff.update', targetType: 'user', targetId, metadata: input }, tx);
    });
    return { id: targetId };
  }
}
