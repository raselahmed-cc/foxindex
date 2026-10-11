import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { eq } from 'drizzle-orm';
import type { Database } from '@foxindex/database';
import { projects } from '@foxindex/database';
import { DATABASE } from '../../database/database.module';
import { NotFoundError } from '../errors/app-error';
import type { AuthenticatedRequest } from './auth.guard';
import type { AuthenticatedApiKey } from './api-key.guard';

export interface ProjectRow {
  id: string;
  userId: string;
  name: string;
  slug: string;
  indexnowKey: string;
}

export interface ProjectContextRequest extends Request {
  user?: AuthenticatedRequest['user'];
  apiKey?: AuthenticatedApiKey;
  project: ProjectRow;
}

/**
 * Resolves `:projectId` and verifies the caller owns it — authorization
 * enforced server-side, never trusting the frontend (constitution §5.5).
 * Must run after AuthGuard/ApiKeyGuard (needs request.user or
 * request.apiKey), before any handler that uses @CurrentProject().
 *
 * Replaces TenantContextGuard (docs/adr/0013): there's no organization or
 * membership table to walk up to anymore — a project belongs to exactly
 * one user, and an API key belongs to exactly one project, so ownership is
 * a single direct check, not a multi-hop resolution. Every route this
 * guard protects is nested under /projects/:projectId/... on purpose, so
 * there's always a :projectId param to resolve — no more flat routes
 * (like the old /urls/:urlId) that needed walking up through a child
 * resource to find its owner.
 */
@Injectable()
export class ProjectOwnershipGuard implements CanActivate {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ProjectContextRequest>();
    const projectId = (request.params as Record<string, string | undefined>).projectId;
    if (!projectId) {
      throw new NotFoundError('Project');
    }

    const project = await this.db.query.projects.findFirst({ where: eq(projects.id, projectId) });
    if (!project) throw new NotFoundError('Project');

    // NotFoundError, not AuthorizationError, on a mismatch: a 403 would
    // confirm a project with this id exists at all, just belonging to
    // someone else — 404 reveals nothing a caller couldn't already guess.
    if (request.apiKey) {
      if (request.apiKey.projectId !== project.id) throw new NotFoundError('Project');
    } else if (!request.user || project.userId !== request.user.id) {
      throw new NotFoundError('Project');
    }

    request.project = project;
    return true;
  }
}
