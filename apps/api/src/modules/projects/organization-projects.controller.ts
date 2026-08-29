import { Body, Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { createProjectSchema, type CreateProjectInput } from '@foxindex/validation';
import { Role } from '@foxindex/types';
import { AuthGuard, type SessionUser } from '../../common/guards/auth.guard';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ProjectsService } from './projects.service';

/** Collection routes (list/create) nest under the organization; item routes live in ProjectsController. */
@Controller('organizations/:organizationId/projects')
@UseGuards(AuthGuard, TenantContextGuard)
export class OrganizationProjectsController {
  // Explicit @Inject(ClassName) — see organizations.controller.ts.
  constructor(@Inject(ProjectsService) private readonly projects: ProjectsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER)
  create(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(createProjectSchema)) body: CreateProjectInput,
  ) {
    return this.projects.create(organizationId, body, user.id);
  }

  @Get()
  findAll(@Param('organizationId') organizationId: string) {
    return this.projects.findAllForOrganization(organizationId);
  }
}
