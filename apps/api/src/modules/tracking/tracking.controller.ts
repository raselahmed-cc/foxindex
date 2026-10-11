import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import {
  createSiteSchema,
  publicSubmitSchema,
  resubmitUrlsSchema,
  urlListQuerySchema,
  type CreateSiteInput,
  type PublicSubmitInput,
  type ResubmitUrlsInput,
  type UrlListQuery,
} from '@foxindex/validation';
import { ApiScope, SessionOrApiKeyGuard } from '../../common/guards/session-or-api-key.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { CurrentCaller, type Caller } from '../../common/decorators/caller.decorator';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { TrackingService } from './tracking.service';

/**
 * URL tracking — the dashboard's All URLs page and the public REST API share
 * these routes. Callers authenticate with a session or an `fx_live_` API key;
 * keys are limited by scope, site and monthly credit cap.
 */
@Controller('urls')
@UseGuards(SessionOrApiKeyGuard, RateLimitGuard)
export class UrlsController {
  constructor(@Inject(TrackingService) private readonly tracking: TrackingService) {}

  @Get()
  @ApiScope('status')
  @RateLimit({ scope: 'urls-read', limit: 600, windowSeconds: 60 })
  list(@CurrentCaller() caller: Caller, @Query(new ZodValidationPipe(urlListQuerySchema)) query: UrlListQuery) {
    return this.tracking.listUrls(caller, query);
  }

  @Post()
  @HttpCode(202)
  @ApiScope('submit')
  @RateLimit({ scope: 'urls-submit', limit: 60, windowSeconds: 60 })
  @UseInterceptors(IdempotencyInterceptor)
  submit(@CurrentCaller() caller: Caller, @Body(new ZodValidationPipe(publicSubmitSchema)) body: PublicSubmitInput) {
    return this.tracking.submit(caller, body);
  }

  @Post('resubmit')
  @HttpCode(202)
  @ApiScope('submit')
  @RateLimit({ scope: 'urls-submit', limit: 60, windowSeconds: 60 })
  @UseInterceptors(IdempotencyInterceptor)
  resubmit(@CurrentCaller() caller: Caller, @Body(new ZodValidationPipe(resubmitUrlsSchema)) body: ResubmitUrlsInput) {
    return this.tracking.resubmit(caller, body);
  }

  @Get(':id')
  @ApiScope('status')
  @RateLimit({ scope: 'urls-read', limit: 600, windowSeconds: 60 })
  get(@CurrentCaller() caller: Caller, @Param('id', ParseUUIDPipe) id: string) {
    return this.tracking.getUrl(caller, id);
  }
}

@Controller('sites')
@UseGuards(SessionOrApiKeyGuard, RateLimitGuard)
export class SitesController {
  constructor(@Inject(TrackingService) private readonly tracking: TrackingService) {}

  @Get()
  @ApiScope('sites')
  @RateLimit({ scope: 'sites', limit: 300, windowSeconds: 60 })
  list(@CurrentCaller() caller: Caller) {
    return this.tracking.listSites(caller);
  }

  @Get('google-setup')
  @ApiScope('sites')
  googleSetup() {
    return this.tracking.googleSetup();
  }

  @Post()
  @ApiScope('sites')
  @RateLimit({ scope: 'sites-write', limit: 30, windowSeconds: 3600 })
  create(@CurrentCaller() caller: Caller, @Body(new ZodValidationPipe(createSiteSchema)) body: CreateSiteInput) {
    return this.tracking.createSite(caller, body);
  }

  @Delete(':id')
  @ApiScope('sites')
  remove(@CurrentCaller() caller: Caller, @Param('id', ParseUUIDPipe) id: string) {
    return this.tracking.deleteSite(caller, id);
  }
}

/** The client dashboard's home page (session only). */
@Controller('overview')
@UseGuards(SessionOrApiKeyGuard)
export class OverviewController {
  constructor(@Inject(TrackingService) private readonly tracking: TrackingService) {}

  @Get()
  @ApiScope('status')
  get(@CurrentCaller() caller: Caller) {
    return this.tracking.overview(caller.userId);
  }
}
