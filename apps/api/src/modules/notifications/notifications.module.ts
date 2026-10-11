import { Global, Module } from '@nestjs/common';
import { mailerProvider } from '../auth/mailer.provider';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, mailerProvider],
  exports: [NotificationsService],
})
export class NotificationsModule {}
