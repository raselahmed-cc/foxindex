import { Module } from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { SessionOrApiKeyGuard } from '../../common/guards/session-or-api-key.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { BatchesModule } from '../batches/batches.module';
import { OverviewController, SitesController, UrlsController } from './tracking.controller';
import { TrackingService } from './tracking.service';

@Module({
  imports: [BatchesModule, ApiKeysModule],
  controllers: [UrlsController, SitesController, OverviewController],
  providers: [TrackingService, AuthGuard, ApiKeyGuard, SessionOrApiKeyGuard, RateLimitGuard],
})
export class TrackingModule {}
