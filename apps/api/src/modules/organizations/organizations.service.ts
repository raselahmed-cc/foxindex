import { Inject, Injectable } from '@nestjs/common';
import type { CreateOrganizationInput, UpdateOrganizationInput } from '@foxindex/validation';
import { NotFoundError } from '../../common/errors/app-error';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { OrganizationsRepository } from './organizations.repository';

@Injectable()
export class OrganizationsService {
  // Explicit @Inject(ClassName) on every param — see organizations.controller.ts
  // for why: tsx/esbuild's decorator-metadata handling doesn't reliably
  // preserve a class used only as a constructor parameter's type.
  constructor(
    @Inject(OrganizationsRepository) private readonly repository: OrganizationsRepository,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
  ) {}

  async create(input: CreateOrganizationInput, userId: string) {
    const organization = await this.repository.createWithOwner({
      name: input.name,
      slug: input.slug,
      createdByUserId: userId,
    });

    await this.auditLog.record({
      organizationId: organization.id,
      actorUserId: userId,
      action: 'organization.created',
      resourceType: 'organization',
      resourceId: organization.id,
    });

    return organization;
  }

  findAllForUser(userId: string) {
    return this.repository.findAllForUser(userId);
  }

  async findOne(organizationId: string) {
    const organization = await this.repository.findById(organizationId);
    if (!organization) throw new NotFoundError('Organization');
    return organization;
  }

  async update(organizationId: string, input: UpdateOrganizationInput) {
    const updated = await this.repository.update(organizationId, input);
    if (!updated) throw new NotFoundError('Organization');
    return updated;
  }
}
