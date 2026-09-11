import { Module } from '@nestjs/common';
import { CreditsModule } from '../credits/credits.module';
import { DomainsModule } from '../domains/domains.module';
import { UrlsModule } from '../urls/urls.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { SessionOrApiKeyGuard } from '../../common/guards/session-or-api-key.guard';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';
import { SubmissionsRepository } from './submissions.repository';

@Module({
  // ApiKeysModule is needed for ApiKeysRepository — SessionOrApiKeyGuard's
  // ApiKeyGuard branch depends on it to authenticate Bearer requests.
  imports: [DomainsModule, UrlsModule, ApiKeysModule, CreditsModule],
  controllers: [SubmissionsController],
  providers: [
    SubmissionsService,
    SubmissionsRepository,
    // Nest's @UseGuards(SomeGuardClass) auto-instantiates a guard referenced
    // by class without requiring it to be a registered provider — but
    // SessionOrApiKeyGuard composes AuthGuard/ApiKeyGuard via its own
    // constructor @Inject(), which IS normal DI and does require them
    // registered somewhere reachable. Explicit here rather than global,
    // since this is currently the only place that needs it.
    AuthGuard,
    ApiKeyGuard,
    SessionOrApiKeyGuard,
  ],
  exports: [SubmissionsService],
})
export class SubmissionsModule {}
