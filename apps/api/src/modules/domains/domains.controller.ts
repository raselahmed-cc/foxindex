import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import { createDomainSchema, verifyDomainQuerySchema } from '@foxindex/validation';
import type { CreateDomainInput, VerifyDomainQuery } from '@foxindex/validation';
import { Role } from '@foxindex/types';
import { AuthGuard, type SessionUser } from '../../common/guards/auth.guard';
import { TenantContextGuard, type TenantContext } from '../../common/guards/tenant-context.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { DomainsService } from './domains.service';

/** Domains are fully nested under their project — including item routes — unlike organizations/projects. */
@Controller('projects/:projectId/domains')
@UseGuards(AuthGuard, TenantContextGuard)
export class DomainsController {
  // Explicit @Inject(ClassName) — see organizations.controller.ts.
  constructor(@Inject(DomainsService) private readonly domains: DomainsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SEO_MANAGER, Role.DEVELOPER)
  create(
    @Param('projectId') projectId: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(createDomainSchema)) body: CreateDomainInput,
  ) {
    return this.domains.create(tenant.organizationId, projectId, body, user.id);
  }

  @Get()
  findAll(@Param('projectId') projectId: string) {
    return this.domains.findAllForProject(projectId);
  }

  @Get(':domainId')
  findOne(@Param('projectId') projectId: string, @Param('domainId') domainId: string) {
    return this.domains.findOne(projectId, domainId);
  }

  @Post(':domainId/verify')
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SEO_MANAGER, Role.DEVELOPER)
  requestVerification(
    @Param('projectId') projectId: string,
    @Param('domainId') domainId: string,
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(verifyDomainQuerySchema)) query: VerifyDomainQuery,
  ) {
    return this.domains.requestVerification(tenant.organizationId, projectId, domainId, query.recheck);
  }

  @Get(':domainId/verifications')
  findVerifications(@Param('projectId') projectId: string, @Param('domainId') domainId: string) {
    return this.domains.findVerifications(projectId, domainId);
  }
}
