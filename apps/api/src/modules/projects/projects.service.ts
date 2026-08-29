import { Inject, Injectable } from '@nestjs/common';
import type { CreateProjectInput, UpdateProjectInput } from '@foxindex/validation';
import { NotFoundError } from '../../common/errors/app-error';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { ProjectsRepository } from './projects.repository';

@Injectable()
export class ProjectsService {
  // Explicit @Inject(ClassName) on every param — see organizations.controller.ts.
  constructor(
    @Inject(ProjectsRepository) private readonly repository: ProjectsRepository,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
  ) {}

  async create(organizationId: string, input: CreateProjectInput, userId: string) {
    const project = await this.repository.create({
      organizationId,
      name: input.name,
      slug: input.slug,
      createdByUserId: userId,
    });

    await this.auditLog.record({
      organizationId,
      actorUserId: userId,
      action: 'project.created',
      resourceType: 'project',
      resourceId: project.id,
    });

    return project;
  }

  findAllForOrganization(organizationId: string) {
    return this.repository.findAllForOrganization(organizationId);
  }

  async findOne(projectId: string) {
    const project = await this.repository.findById(projectId);
    if (!project) throw new NotFoundError('Project');
    return project;
  }

  async update(projectId: string, input: UpdateProjectInput) {
    const updated = await this.repository.update(projectId, input);
    if (!updated) throw new NotFoundError('Project');
    return updated;
  }
}
