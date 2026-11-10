import { Module } from '@nestjs/common';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { GoogleConnectController, GoogleOAuthCallbackController } from './google-connect.controller';
import { GoogleConnectService } from './google-connect.service';

@Module({
  controllers: [GoogleConnectController, GoogleOAuthCallbackController],
  providers: [GoogleConnectService, RateLimitGuard],
  exports: [GoogleConnectService],
})
export class GoogleConnectModule {}
