import { Injectable } from '@nestjs/common';
import type { CreateProjectInput, UpdateProjectInput } from '@foxindex/validation';
import { NotFoundError } from '../../common/errors/app-error';
// Regular imports — constructor-injected, see organizations.service.ts for why
// `import type` here would silently break Nest's DI.
import { AuditLogService } from '../audit-logs/audit-log.service';
import { ProjectsRepository } from './projects.repository';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly repository: ProjectsRepository,
    private readonly auditLog: AuditLogService,
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
