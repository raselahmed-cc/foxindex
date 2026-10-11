import { eq, or, sql, type SQL } from 'drizzle-orm';
import { tickets, users } from '@foxindex/database';
import { UserRole } from '@foxindex/types';

export interface TicketActor {
  id: string;
  role: UserRole;
}

export const isStaff = (a: TicketActor) => a.role !== UserRole.CLIENT;
export const isAdmin = (a: TicketActor) => a.role === UserRole.ADMIN || a.role === UserRole.SUPERADMIN;

/** Row-level visibility: clients see their own, managers their clients' and assigned tickets, admins all. */
export function ticketScope(actor: TicketActor): SQL | undefined {
  if (actor.role === UserRole.CLIENT) return eq(tickets.userId, actor.id);
  if (actor.role === UserRole.MANAGER) {
    return or(eq(tickets.assignedManagerId, actor.id), sql`${tickets.userId} IN (SELECT id FROM ${users} WHERE assigned_manager_id = ${actor.id})`);
  }
  return undefined;
}
