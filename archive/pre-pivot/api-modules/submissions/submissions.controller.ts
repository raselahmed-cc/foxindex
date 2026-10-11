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
import { ApiKeyScope } from '@foxindex/types';
import { SessionOrApiKeyGuard } from '../../common/guards/session-or-api-key.guard';
import { type AuthenticatedApiKey } from '../../common/guards/api-key.guard';
import { ProjectOwnershipGuard, type ProjectRow } from '../../common/guards/project-ownership.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentApiKey } from '../../common/decorators/current-api-key.decorator';
import { CurrentProject } from '../../common/decorators/current-project.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor';
import { AuthorizationError } from '../../common/errors/app-error';
import { SubmissionsService } from './submissions.service';

/**
 * The one resource reachable via either a human session OR a Bearer API key
 * (constitution §19's programmatic-submission path) — every other controller
 * in this app is session-only. ProjectOwnershipGuard alone authorizes every
 * route here now (docs/adr/0013) — there's no org-role check left, since
 * a project has exactly one owner.
 */
@Controller('projects/:projectId/submissions')
@UseGuards(SessionOrApiKeyGuard, ProjectOwnershipGuard)
export class SubmissionsController {
  constructor(@Inject(SubmissionsService) private readonly submissions: SubmissionsService) {}

  @Post()
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 100, windowSeconds: 60, scope: 'submissions' })
  @UseInterceptors(IdempotencyInterceptor)
  create(
    @CurrentProject() project: ProjectRow,
    @CurrentUser() user: { id: string } | undefined,
    @CurrentApiKey() apiKey: AuthenticatedApiKey | undefined,
    @Body(new ZodValidationPipe(submitUrlsSchema)) body: SubmitUrlsInput,
  ) {
    // An API key additionally needs its own SUBMIT_URLS scope — narrower
    // than "any owner-equivalent caller" on purpose, since a key might be
    // deliberately issued read-only.
    if (apiKey && !apiKey.scopes.includes(ApiKeyScope.SUBMIT_URLS)) {
      throw new AuthorizationError('This API key does not have the SUBMIT_URLS scope');
    }

    return this.submissions.submitUrls(project, body, {
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
      since: query.since,
      limit: query.limit,
    });
  }

  @Get(':submissionId')
  findOne(@Param('projectId') projectId: string, @Param('submissionId') submissionId: string) {
    return this.submissions.findOne(projectId, submissionId);
  }
}
