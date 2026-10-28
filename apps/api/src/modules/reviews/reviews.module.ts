import { Module } from '@nestjs/common';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { AdminReviewsController, PublicReviewsController, ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  controllers: [ReviewsController, PublicReviewsController, AdminReviewsController],
  providers: [ReviewsService, RateLimitGuard],
})
export class ReviewsModule {}
