import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { findLeastLoadedManager, hashPassword } from '@foxindex/auth';
import { users, type Database } from '@foxindex/database';
import { DATABASE } from '../../database/database.module';
import type {
  ApproveUserInput,
  AssignManagerInput,
  CreateClientInput,
  GrantCreditsInput,
  SetUserStatusInput,
  UserListQuery,
} from '@foxindex/validation';
import { UserRole } from '@foxindex/types';
import { NotFoundError, ValidationError } from '../../common/errors/app-error';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { CreditsRepository } from '../credits/credits.repository';
import { AuthService } from '../auth/auth.service';
import { AdminRepository } from './admin.repository';
import { ChatRepository } from '../chat/chat.repository';
import { conversationRoom, RealtimeService } from '../../common/realtime/realtime.service';

@Injectable()
export class AdminService {
  constructor(
    @Inject(AdminRepository) private readonly repository: AdminRepository,
    @Inject(CreditsRepository) private readonly credits: CreditsRepository,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ChatRepository) private readonly chat: ChatRepository,
    @Inject(RealtimeService) private readonly realtime: RealtimeService,
    @Inject(DATABASE) private readonly db: Database,
  ) {}

  /**
   * Admin-created customer: active and email-verified at once (no signup flow).
   * The password is returned once so the admin can hand it over, even without email.
   */
  async createClient(actorId: string, input: CreateClientInput) {
    const existing = await this.db.query.users.findFirst({ where: eq(users.email, input.email), columns: { id: true } });
    if (existing) throw new ValidationError('Someone already uses that email', { reason: 'EMAIL_ALREADY_REGISTERED' });

    let managerId = input.managerId ?? null;
    if (managerId) {
      const mgr = await this.db.query.users.findFirst({ where: and(eq(users.id, managerId), eq(users.role, 'manager'), eq(users.status, 'active')), columns: { id: true } });
      if (!mgr) throw new ValidationError('That manager does not exist or is not active');
    } else if (input.managerId === undefined) {
      managerId = (await findLeastLoadedManager(this.db))?.id ?? null;
    }

    const password = input.password ?? randomBytes(12).toString('base64url');
    const passwordHash = await hashPassword(password);
    const created = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(users)
        .values({
          name: input.name,
          email: input.email,
          passwordHash,
          phone: input.whatsapp,
          whatsapp: input.whatsapp,
          company: input.company || null,
          country: input.country || null,
          city: input.city || null,
          role: UserRole.CLIENT,
          status: 'active',
          assignedManagerId: managerId,
        })
        .returning({ id: users.id, name: users.name, email: users.email });
      if (input.startingCredits > 0) {
        await this.credits.grant(row.id, input.startingCredits, 'manual_add', actorId, 'Starting credit (account created by staff)', tx);
      }
      await this.auditLog.record({ actorId, action: 'user.create_by_admin', targetType: 'user', targetId: row.id, metadata: { email: row.email, managerId, startingCredits: input.startingCredits } }, tx);
      return row;
    });
    return { ...created, password, managerId };
  }

  findUsersForActor(actor: { id: string; role: UserRole }, filters: UserListQuery = {}) {
    return this.repository.findUsersForActor(actor, filters);
  }

  async setStatus(targetUserId: string, actor: { id: string; role: UserRole }, input: SetUserStatusInput) {
    const target = await this.repository.findUserById(targetUserId);
    if (!target) throw new NotFoundError('User');
    if (target.role !== UserRole.CLIENT) {
      throw new ValidationError('Use Staff & roles to change a staff member’s status');
    }
    const updated = await this.repository.setStatus(targetUserId, input.status);
    await this.auditLog.record({
      actorId: actor.id,
      action: input.status === 'suspended' ? 'user.suspend' : 'user.activate',
      targetType: 'user',
      targetId: targetUserId,
    });
    return updated;
  }

  findManagers() {
    return this.repository.findManagers();
  }

  async assignManager(targetUserId: string, actorId: string, input: AssignManagerInput) {
    const [target, manager] = await Promise.all([
      this.repository.findUserById(targetUserId),
      this.repository.findUserById(input.managerId),
    ]);
    if (!target) throw new NotFoundError('User');
    if (!manager || manager.role !== UserRole.MANAGER) {
      throw new ValidationError('managerId must reference an existing manager');
    }

    const previousManagerId = target.assignedManagerId;
    const updated = await this.repository.assignManager(targetUserId, input.managerId);

    // Chat history follows the client to the new manager; live sockets re-join the right rooms.
    const conversationId = await this.chat.transferClient(targetUserId, input.managerId);
    if (conversationId) {
      this.realtime.joinUserToRoom(input.managerId, conversationRoom(conversationId));
      this.realtime.joinUserToRoom(targetUserId, conversationRoom(conversationId));
      if (previousManagerId && previousManagerId !== input.managerId) this.realtime.leaveRoom(previousManagerId, conversationRoom(conversationId));
    }
    this.realtime.emitToUsers([input.managerId, targetUserId, ...(previousManagerId ? [previousManagerId] : [])], 'conversations:changed', { clientId: targetUserId });

    await this.auditLog.record({
      actorId,
      action: 'user.manager_reassigned',
      targetType: 'user',
      targetId: targetUserId,
      metadata: { managerId: input.managerId },
    });

    return updated;
  }

  approve(targetUserId: string, actorId: string, input: ApproveUserInput) {
    return this.auth.approve(targetUserId, actorId, input);
  }

  async grantCredits(targetUserId: string, actorId: string, input: GrantCreditsInput) {
    const target = await this.repository.findUserById(targetUserId);
    if (!target) throw new NotFoundError('User');

    const balance = await this.credits.grant(targetUserId, input.amount, 'manual_add', actorId, input.note);

    await this.auditLog.record({
      actorId,
      action: 'credits.manual_grant',
      targetType: 'user',
      targetId: targetUserId,
      metadata: { amount: input.amount, note: input.note },
    });

    return { userId: targetUserId, balance };
  }
}
