import { Inject, Injectable } from '@nestjs/common';
import { generateIndexNowKey } from '@foxindex/providers';
import type { CreateProjectInput, UpdateProjectInput } from '@foxindex/validation';
import { NotFoundError } from '../../common/errors/app-error';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { ProjectsRepository } from './projects.repository';

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(ProjectsRepository) private readonly repository: ProjectsRepository,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
  ) {}

  async create(userId: string, input: CreateProjectInput) {
    const project = await this.repository.create({
      userId,
      name: input.name,
      slug: input.slug,
      indexnowKey: generateIndexNowKey(),
    });

    await this.auditLog.record({
      userId,
      actorUserId: userId,
      action: 'project.created',
      resourceType: 'project',
      resourceId: project.id,
    });

    return project;
  }

  findAllForUser(userId: string) {
    return this.repository.findAllForUser(userId);
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
