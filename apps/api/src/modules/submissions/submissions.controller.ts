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
import { Role } from '@foxindex/types';
import { AuthGuard, type SessionUser } from '../../common/guards/auth.guard';
import { TenantContextGuard, type TenantContext } from '../../common/guards/tenant-context.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor';
import { SubmissionsService } from './submissions.service';

@Controller('projects/:projectId/submissions')
@UseGuards(AuthGuard, TenantContextGuard)
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
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(submitUrlsSchema)) body: SubmitUrlsInput,
  ) {
    return this.submissions.submitUrls(tenant.organizationId, projectId, body, { userId: user.id });
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
