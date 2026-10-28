import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Put, Query, UseGuards } from '@nestjs/common';
import {
  moderateReviewSchema,
  publicReviewQuerySchema,
  reviewListQuerySchema,
  submitReviewSchema,
  type ModerateReviewInput,
  type PublicReviewQuery,
  type ReviewListQuery,
  type SubmitReviewInput,
} from '@foxindex/validation';
import { UserRole } from '@foxindex/types';
import { AuthGuard, type AuthenticatedRequest } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ReviewsService } from './reviews.service';

type Actor = AuthenticatedRequest['user'];

/** A client's own review. */
@Controller('reviews')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.CLIENT)
export class ReviewsController {
  constructor(@Inject(ReviewsService) private readonly reviews: ReviewsService) {}

  @Get('mine')
  mine(@CurrentUser() actor: Actor) {
    return this.reviews.mine(actor.id);
  }

  @Put('mine')
  submit(@CurrentUser() actor: Actor, @Body(new ZodValidationPipe(submitReviewSchema)) body: SubmitReviewInput) {
    return this.reviews.submit(actor.id, body);
  }
}

/** Approved reviews for the marketing site — no account needed. */
@Controller('public/reviews')
@UseGuards(RateLimitGuard)
export class PublicReviewsController {
  constructor(@Inject(ReviewsService) private readonly reviews: ReviewsService) {}

  @Get()
  @RateLimit({ scope: 'public-reviews', limit: 120, windowSeconds: 60 })
  list(@Query(new ZodValidationPipe(publicReviewQuerySchema)) query: PublicReviewQuery) {
    return this.reviews.published(query);
  }
}

/** Moderation — admins decide what is published. */
@Controller('admin/reviews')
@UseGuards(AuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPERADMIN)
export class AdminReviewsController {
  constructor(@Inject(ReviewsService) private readonly reviews: ReviewsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(reviewListQuerySchema)) query: ReviewListQuery) {
    return this.reviews.list(query);
  }

  @Patch(':id')
  moderate(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(moderateReviewSchema)) body: ModerateReviewInput,
  ) {
    return this.reviews.moderate(actor.id, id, body);
  }
}
