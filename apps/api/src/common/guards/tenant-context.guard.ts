import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { Database } from '@foxindex/database';
import { domains, organizationMembers, projects, urls } from '@foxindex/database';
import type { Role } from '@foxindex/types';
import { DATABASE } from '../../database/database.module';
import { AppError, AuthorizationError, NotFoundError } from '../errors/app-error';
import { ErrorCode } from '@foxindex/types';
import type { AuthenticatedRequest } from './auth.guard';

export interface TenantContext {
  organizationId: string;
  projectId?: string;
  role: Role;
}

export interface TenantContextRequest extends AuthenticatedRequest {
  tenant: TenantContext;
}

/**
 * Resolves which organization (and project, where applicable) a request
 * operates on and verifies the authenticated user is a member of it —
 * authorization enforced server-side, never trusting the frontend (constitution
 * §5.5). Must run after AuthGuard (needs request.user) and before RolesGuard
 * (needs request.tenant.role).
 *
 * Resolution order: an explicit `:organizationId` route param wins; otherwise
 * `:projectId` is resolved to its owning organization; otherwise `:domainId` or
 * `:urlId` is resolved by walking domain/url -> project -> organizationId.
 * Routes with none of these params (e.g. POST /organizations, which creates a
 * new org) don't use this guard at all.
 */
@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const params = request.params as Record<string, string | undefined>;

    const resolved = await this.resolveOrganizationAndProject(params);

    const membership = await this.db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, resolved.organizationId),
        eq(organizationMembers.userId, request.user.id),
      ),
    });

    if (!membership) {
      throw new AuthorizationError();
    }

    (request as TenantContextRequest).tenant = {
      organizationId: resolved.organizationId,
      projectId: resolved.projectId,
      role: membership.role,
    };
    return true;
  }

  private async resolveOrganizationAndProject(
    params: Record<string, string | undefined>,
  ): Promise<{ organizationId: string; projectId?: string }> {
    if (params.organizationId) {
      return { organizationId: params.organizationId, projectId: params.projectId };
    }

    if (params.projectId) {
      const project = await this.db.query.projects.findFirst({
        where: eq(projects.id, params.projectId),
      });
      if (!project) throw new NotFoundError('Project');
      return { organizationId: project.organizationId, projectId: project.id };
    }

    if (params.domainId) {
      const domain = await this.db.query.domains.findFirst({
        where: eq(domains.id, params.domainId),
      });
      if (!domain) throw new NotFoundError('Domain');
      return { organizationId: domain.organizationId, projectId: domain.projectId };
    }

    if (params.urlId) {
      const url = await this.db.query.urls.findFirst({ where: eq(urls.id, params.urlId) });
      if (!url) throw new NotFoundError('URL');
      return { organizationId: url.organizationId, projectId: url.projectId };
    }

    throw new AppError(
      ErrorCode.INTERNAL_ERROR,
      'TenantContextGuard could not resolve an organization for this route — check the route params',
    );
  }
}
