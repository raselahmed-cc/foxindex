import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Database } from '@foxindex/database';
import { organizationMembers, organizations } from '@foxindex/database';
import { Role } from '@foxindex/types';
import { DATABASE } from '../../database/database.module';

export interface CreateOrganizationWithOwnerInput {
  name: string;
  slug: string;
  createdByUserId: string;
}

@Injectable()
export class OrganizationsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Creates the org and inserts the creator as OWNER in one transaction — Phase 1's only membership path. */
  async createWithOwner(input: CreateOrganizationWithOwnerInput) {
    return this.db.transaction(async (tx) => {
      const [organization] = await tx
        .insert(organizations)
        .values({ name: input.name, slug: input.slug, createdByUserId: input.createdByUserId })
        .returning();

      await tx.insert(organizationMembers).values({
        organizationId: organization.id,
        userId: input.createdByUserId,
        role: Role.OWNER,
        joinedAt: new Date(),
      });

      return organization;
    });
  }

  async findAllForUser(userId: string) {
    const memberships = await this.db.query.organizationMembers.findMany({
      where: eq(organizationMembers.userId, userId),
      with: { organization: true },
    });
    return memberships.map((membership) => ({ ...membership.organization, role: membership.role }));
  }

  async findById(organizationId: string) {
    return this.db.query.organizations.findFirst({ where: eq(organizations.id, organizationId) });
  }

  async update(organizationId: string, input: Partial<{ name: string; slug: string }>) {
    const [updated] = await this.db
      .update(organizations)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(organizations.id, organizationId))
      .returning();
    return updated;
  }
}
