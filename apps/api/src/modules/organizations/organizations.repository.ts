import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Database } from '@foxindex/database';
import { organizationMembers, organizations } from '@foxindex/database';
import { CreditLedgerReason, Role } from '@foxindex/types';
import { STARTER_CREDIT_BALANCE } from '@foxindex/config';
import { DATABASE } from '../../database/database.module';
import { CreditsRepository } from '../credits/credits.repository';

export interface CreateOrganizationWithOwnerInput {
  name: string;
  slug: string;
  createdByUserId: string;
}

@Injectable()
export class OrganizationsRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CreditsRepository) private readonly credits: CreditsRepository,
  ) {}

  /**
   * Creates the org, inserts the creator as OWNER, and grants the starter
   * credit balance — all in one transaction (docs/adr/0011: an org that
   * exists with no credits, or credits granted to an org creation that then
   * rolled back, are both states worth avoiding). The initial insert's own
   * `.returning()` still has creditBalance at its schema default (0); the
   * grant's returned balance is what actually reflects reality afterward.
   */
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

      const creditBalance = await this.credits.grant(
        organization.id,
        STARTER_CREDIT_BALANCE,
        CreditLedgerReason.SIGNUP_BONUS,
        undefined,
        tx,
      );

      return { ...organization, creditBalance };
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
