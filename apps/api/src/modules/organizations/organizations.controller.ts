import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  createOrganizationSchema,
  updateOrganizationSchema,
  type CreateOrganizationInput,
  type UpdateOrganizationInput,
} from '@foxindex/validation';
import { Role } from '@foxindex/types';
import { AuthGuard, type SessionUser } from '../../common/guards/auth.guard';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
// Regular import — constructor-injected, see organizations.service.ts for why
// `import type` here would silently break Nest's DI.
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post()
  @UseGuards(AuthGuard)
  create(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(createOrganizationSchema)) body: CreateOrganizationInput,
  ) {
    return this.organizations.create(body, user.id);
  }

  @Get()
  @UseGuards(AuthGuard)
  findAll(@CurrentUser() user: SessionUser) {
    return this.organizations.findAllForUser(user.id);
  }

  @Get(':organizationId')
  @UseGuards(AuthGuard, TenantContextGuard)
  findOne(@Param('organizationId') organizationId: string) {
    return this.organizations.findOne(organizationId);
  }

  @Patch(':organizationId')
  @UseGuards(AuthGuard, TenantContextGuard, RolesGuard)
  @Roles(Role.OWNER, Role.ADMIN)
  update(
    @Param('organizationId') organizationId: string,
    @Body(new ZodValidationPipe(updateOrganizationSchema)) body: UpdateOrganizationInput,
  ) {
    return this.organizations.update(organizationId, body);
  }
}
