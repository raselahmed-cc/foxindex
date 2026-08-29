import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { and, eq } from 'drizzle-orm';
import type { Database } from '@foxindex/database';
import { domains, organizationMembers, projects, urls } from '@foxindex/database';
import { Role } from '@foxindex/types';
import { DATABASE } from '../../database/database.module';
import { AppError, AuthorizationError, NotFoundError } from '../errors/app-error';
import { ErrorCode } from '@foxindex/types';
import type { AuthenticatedRequest } from './auth.guard';
import type { AuthenticatedApiKey } from './api-key.guard';

export interface TenantContext {
  organizationId: string;
  projectId?: string;
  role: Role;
}

export interface TenantContextRequest extends AuthenticatedRequest {
  tenant: TenantContext;
}

/** Extends the base Express Request (so .params etc. are always present) — only user/apiKey are optional, since exactly one is set depending on which guard ran. */
interface SessionOrApiKeyRequest extends Request {
  user?: AuthenticatedRequest['user'];
  apiKey?: AuthenticatedApiKey;
}

/**
 * Resolves which organization (and project, where applicable) a request
 * operates on and verifies the caller may access it — authorization enforced
 * server-side, never trusting the frontend (constitution §5.5). Must run
 * after AuthGuard/ApiKeyGuard (needs request.user or request.apiKey) and
 * before RolesGuard (needs request.tenant.role).
 *
 * Resolution order: an explicit `:organizationId` route param wins; otherwise
 * `:projectId` is resolved to its owning organization; otherwise `:domainId` or
 * `:urlId` is resolved by walking domain/url -> project -> organizationId.
 * Routes with none of these params (e.g. POST /organizations, which creates a
 * new org) don't use this guard at all.
 *
 * Handles two distinct authenticated identities: a human session (checked
 * against organization_members) or an API key (checked against the key's own
 * organizationId/projectId scope — an API key was never a member of anything,
 * it IS the credential). An API-key request is assigned Role.DEVELOPER as a
 * practical default so it satisfies the same @Roles() checks a human
 * developer would (submissions is the only route reachable this way) — the
 * key's own `scopes` (SUBMIT_URLS/READ_ONLY) are a separate, stricter check
 * applied where it matters (see SubmissionsController), not a replacement for
 * this role.
 */
@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SessionOrApiKeyRequest>();
    const params = request.params as Record<string, string | undefined>;

    const resolved = await this.resolveOrganizationAndProject(params);

    if (request.apiKey) {
      if (request.apiKey.organizationId !== resolved.organizationId) {
        throw new AuthorizationError();
      }
      if (
        request.apiKey.projectId &&
        resolved.projectId &&
        request.apiKey.projectId !== resolved.projectId
      ) {
        throw new AuthorizationError();
      }
      (request as SessionOrApiKeyRequest & { tenant: TenantContext }).tenant = {
        organizationId: resolved.organizationId,
        projectId: resolved.projectId,
        role: Role.DEVELOPER,
      };
      return true;
    }

    const membership = await this.db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.organizationId, resolved.organizationId),
        eq(organizationMembers.userId, request.user!.id),
      ),
    });

    if (!membership) {
      throw new AuthorizationError();
    }

    (request as SessionOrApiKeyRequest & { tenant: TenantContext }).tenant = {
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
