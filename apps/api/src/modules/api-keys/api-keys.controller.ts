import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import {
  createApiKeySchema,
  updateApiKeySchema,
  type CreateApiKeyInput,
  type UpdateApiKeyInput,
} from '@foxindex/validation';
import { AuthGuard, type AuthenticatedRequest } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ApiKeysService } from './api-keys.service';

@Controller('api-keys')
@UseGuards(AuthGuard)
export class ApiKeysController {
  constructor(@Inject(ApiKeysService) private readonly apiKeys: ApiKeysService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedRequest['user']) {
    return this.apiKeys.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Body(new ZodValidationPipe(createApiKeySchema)) body: CreateApiKeyInput,
  ) {
    return this.apiKeys.create(user.id, body);
  }

  @Patch(':keyId')
  update(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('keyId', ParseUUIDPipe) keyId: string,
    @Body(new ZodValidationPipe(updateApiKeySchema)) body: UpdateApiKeyInput,
  ) {
    return this.apiKeys.update(user.id, keyId, body);
  }

  @Delete(':keyId')
  revoke(@CurrentUser() user: AuthenticatedRequest['user'], @Param('keyId', ParseUUIDPipe) keyId: string) {
    return this.apiKeys.revoke(user.id, keyId);
  }
}
