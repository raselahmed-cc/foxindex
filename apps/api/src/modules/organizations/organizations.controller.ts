import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
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
  // Explicit @Inject(ClassName), not just relying on implicit type-based
  // reflection: found via live testing that tsx/esbuild's decorator-metadata
  // handling (used by `pnpm dev`) does not reliably preserve a class import
  // used only as a constructor parameter's type, leaving the property
  // undefined at runtime with no error at boot. tsc (the real build) handles
  // it correctly, but the gap isn't worth relying on — this is now a firm
  // convention for every Nest-injected class in apps/api.
  constructor(@Inject(OrganizationsService) private readonly organizations: OrganizationsService) {}

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
