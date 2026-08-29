import { Body, Controller, Delete, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { createApiKeySchema, type CreateApiKeyInput } from '@foxindex/validation';
import { Role } from '@foxindex/types';
import { AuthGuard, type SessionUser } from '../../common/guards/auth.guard';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ApiKeysService } from './api-keys.service';

@Controller('organizations/:organizationId/api-keys')
@UseGuards(AuthGuard, TenantContextGuard, RolesGuard)
@Roles(Role.OWNER, Role.ADMIN)
export class ApiKeysController {
  constructor(@Inject(ApiKeysService) private readonly apiKeys: ApiKeysService) {}

  @Post()
  create(
    @Param('organizationId') organizationId: string,
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(createApiKeySchema)) body: CreateApiKeyInput,
  ) {
    return this.apiKeys.create(organizationId, body, user.id);
  }

  @Get()
  findAll(@Param('organizationId') organizationId: string) {
    return this.apiKeys.findAllForOrganization(organizationId);
  }

  @Delete(':keyId')
  revoke(
    @Param('organizationId') organizationId: string,
    @Param('keyId') keyId: string,
    @CurrentUser() user: SessionUser,
  ) {
    return this.apiKeys.revoke(organizationId, keyId, user.id);
  }
}
