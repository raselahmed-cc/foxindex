import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Database } from '@foxindex/database';
import { users } from '@foxindex/database';
import { UserRole } from '@foxindex/types';
import { DATABASE } from '../../database/database.module';
import { AuthorizationError, NotFoundError } from '../errors/app-error';
import type { AuthenticatedRequest } from './auth.guard';

/**
 * CLAUDE.md "Roles": a manager may act on `:userId` only if it's one of
 * their assigned clients; admin/superadmin bypass the check. Must run after
 * AuthGuard. Route must have a `:userId` param naming the target client.
 */
@Injectable()
export class OwnsClientGuard implements CanActivate {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const actor = request.user;

    if (actor.role === UserRole.ADMIN || actor.role === UserRole.SUPERADMIN) {
      return true;
    }

    const targetUserId = request.params.userId as string;
    const target = await this.db.query.users.findFirst({
      where: eq(users.id, targetUserId),
      columns: { assignedManagerId: true },
    });

    if (!target) {
      throw new NotFoundError('User');
    }
    if (actor.role !== UserRole.MANAGER || target.assignedManagerId !== actor.id) {
      throw new AuthorizationError();
    }
    return true;
  }
}
