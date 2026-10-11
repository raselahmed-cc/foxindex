import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, isNull, or } from 'drizzle-orm';
import type { Database } from '@foxindex/database';
import { sessions, users } from '@foxindex/database';
import type { UserListQuery } from '@foxindex/validation';
import { UserRole, UserStatus } from '@foxindex/types';
import { DATABASE } from '../../database/database.module';

// Relational query API shape (boolean flags) — for .findMany()/.findFirst().
const USER_LIST_COLUMNS = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  assignedManagerId: true,
  creditBalanceCached: true,
  createdAt: true,
} as const;

// Core query builder shape (column references) — for .returning(); never
// include passwordHash here or anywhere else a user row crosses the API boundary.
const RETURNING_USER_COLUMNS = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  status: users.status,
  assignedManagerId: users.assignedManagerId,
  creditBalanceCached: users.creditBalanceCached,
  createdAt: users.createdAt,
};

@Injectable()
export class AdminRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * CLAUDE.md "Roles": managers must never see users outside their
   * assignment, including via list endpoints — enforced here at the query
   * level (filtered by actor), not just by a route guard, since a guard
   * alone can't scope the rows a list endpoint returns.
   */
  findUsersForActor(actor: { id: string; role: UserRole }, filters: UserListQuery = {}) {
    const term = filters.q ? `%${filters.q.replace(/[%_]/g, '\\$&')}%` : null;
    return this.db.query.users.findMany({
      columns: { ...USER_LIST_COLUMNS, phone: true, whatsapp: true, country: true, city: true },
      with: { assignedManager: { columns: { id: true, name: true } } },
      where: and(
        // Managers only ever see their own clients — enforced in the query, not just a route guard.
        actor.role === UserRole.MANAGER ? eq(users.assignedManagerId, actor.id) : undefined,
        filters.status ? eq(users.status, filters.status) : undefined,
        filters.role ? eq(users.role, filters.role) : undefined,
        term ? or(ilike(users.name, term), ilike(users.email, term)) : undefined,
      ),
      orderBy: desc(users.createdAt),
      limit: 500,
    });
  }

  async setStatus(userId: string, status: 'active' | 'suspended') {
    const [updated] = await this.db
      .update(users)
      .set({ status, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning(RETURNING_USER_COLUMNS);
    if (status === 'suspended') {
      await this.db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
    }
    return updated;
  }

  findManagers() {
    return this.db.query.users.findMany({
      columns: { id: true, name: true, email: true },
      where: and(eq(users.role, UserRole.MANAGER), eq(users.status, UserStatus.ACTIVE)),
      orderBy: desc(users.createdAt),
    });
  }

  findUserById(userId: string) {
    return this.db.query.users.findFirst({ where: eq(users.id, userId) });
  }

  async assignManager(userId: string, managerId: string) {
    const [updated] = await this.db
      .update(users)
      .set({ assignedManagerId: managerId, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning(RETURNING_USER_COLUMNS);
    return updated;
  }
}
