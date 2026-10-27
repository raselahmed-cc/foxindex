import { Module } from '@nestjs/common';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { PublicVisitorChatController, StaffVisitorChatController } from './visitor-chat.controller';
import { VisitorChatGateway } from './visitor-chat.gateway';
import { VisitorChatService } from './visitor-chat.service';

@Module({
  controllers: [PublicVisitorChatController, StaffVisitorChatController],
  providers: [VisitorChatService, VisitorChatGateway, RateLimitGuard],
})
export class VisitorChatModule {}
