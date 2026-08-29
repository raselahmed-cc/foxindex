import { Injectable } from '@nestjs/common';
import type { CreateOrganizationInput, UpdateOrganizationInput } from '@foxindex/validation';
import { NotFoundError } from '../../common/errors/app-error';
// Regular (not `import type`) imports below: these classes are constructor-
// injected. emitDecoratorMetadata needs the real value to emit
// design:paramtypes for Nest's DI to resolve them — `import type` erases it
// entirely and silently breaks injection at boot.
import { AuditLogService } from '../audit-logs/audit-log.service';
import { OrganizationsRepository } from './organizations.repository';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly repository: OrganizationsRepository,
    private readonly auditLog: AuditLogService,
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
