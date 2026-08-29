import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Database } from '@foxindex/database';
import { projects } from '@foxindex/database';
import { DATABASE } from '../../database/database.module';

export interface CreateProjectInput {
  organizationId: string;
  name: string;
  slug: string;
  createdByUserId: string;
}

@Injectable()
export class ProjectsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async create(input: CreateProjectInput) {
    const [project] = await this.db.insert(projects).values(input).returning();
    return project;
  }

  findAllForOrganization(organizationId: string) {
    return this.db.query.projects.findMany({ where: eq(projects.organizationId, organizationId) });
  }

  findById(projectId: string) {
    return this.db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  }

  async update(projectId: string, input: Partial<{ name: string; slug: string }>) {
    const [updated] = await this.db
      .update(projects)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(projects.id, projectId))
      .returning();
    return updated;
  }
}
