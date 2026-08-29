import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  listSubmissionsQuerySchema,
  submitUrlsSchema,
  type ListSubmissionsQuery,
  type SubmitUrlsInput,
} from '@foxindex/validation';
import { ApiKeyScope, Role } from '@foxindex/types';
import { SessionOrApiKeyGuard } from '../../common/guards/session-or-api-key.guard';
import { type AuthenticatedApiKey } from '../../common/guards/api-key.guard';
import { TenantContextGuard, type TenantContext } from '../../common/guards/tenant-context.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentApiKey } from '../../common/decorators/current-api-key.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor';
import { AuthorizationError } from '../../common/errors/app-error';
import { SubmissionsService } from './submissions.service';

/**
 * The one resource reachable via either a human session OR a Bearer API key
 * (constitution §19's programmatic-submission path) — every other controller
 * in this app is session-only.
 */
@Controller('projects/:projectId/submissions')
@UseGuards(SessionOrApiKeyGuard, TenantContextGuard)
export class SubmissionsController {
  constructor(@Inject(SubmissionsService) private readonly submissions: SubmissionsService) {}

  @Post()
  @UseGuards(RolesGuard, RateLimitGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SEO_MANAGER, Role.DEVELOPER)
  @RateLimit({ limit: 100, windowSeconds: 60, scope: 'submissions' })
  @UseInterceptors(IdempotencyInterceptor)
  create(
    @Param('projectId') projectId: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: { id: string } | undefined,
    @CurrentApiKey() apiKey: AuthenticatedApiKey | undefined,
    @Body(new ZodValidationPipe(submitUrlsSchema)) body: SubmitUrlsInput,
  ) {
    // RolesGuard already covers session callers (@Roles above); an API key
    // additionally needs its own SUBMIT_URLS scope — narrower than "any
    // DEVELOPER-equivalent caller" on purpose, since a key might be
    // deliberately issued read-only.
    if (apiKey && !apiKey.scopes.includes(ApiKeyScope.SUBMIT_URLS)) {
      throw new AuthorizationError('This API key does not have the SUBMIT_URLS scope');
    }

    return this.submissions.submitUrls(tenant.organizationId, projectId, body, {
      userId: user?.id,
      apiKeyId: apiKey?.id,
    });
  }

  @Get()
  findAll(
    @Param('projectId') projectId: string,
    @Query(new ZodValidationPipe(listSubmissionsQuerySchema)) query: ListSubmissionsQuery,
  ) {
    return this.submissions.findAllForProject(projectId, {
      state: query.state,
      domainId: query.domainId,
      since: query.since,
      limit: query.limit,
    });
  }

  @Get(':submissionId')
  findOne(@Param('projectId') projectId: string, @Param('submissionId') submissionId: string) {
    return this.submissions.findOne(projectId, submissionId);
  }
}
