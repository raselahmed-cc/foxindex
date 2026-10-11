import { sql } from 'drizzle-orm';
import type { Database } from '@foxindex/database';
import { users } from '@foxindex/database';

/**
 * CLAUDE.md "Account lifecycle": on email verification, auto-assign the
 * manager with the fewest active clients. Counts active clients per active
 * manager with a LEFT JOIN so a manager with zero clients still sorts first,
 * rather than being excluded by an inner join. Returns null if no manager
 * exists yet (bootstrap state — see docs/adr/0013's equivalent note about
 * the first Admin/Super Admin needing a direct DB update).
 */
export async function findLeastLoadedManager(db: Database): Promise<{ id: string } | null> {
  const rows = await db.execute<{ id: string }>(sql`
    SELECT m.id
    FROM ${users} m
    LEFT JOIN ${users} c
      ON c.assigned_manager_id = m.id AND c.status = 'active'
    WHERE m.role = 'manager' AND m.status = 'active'
    GROUP BY m.id
    HAVING m.max_clients IS NULL OR COUNT(c.id) < m.max_clients
    ORDER BY COUNT(c.id) ASC, m.created_at ASC
    LIMIT 1
  `);

  const [row] = rows.rows;
  return row ?? null;
}
