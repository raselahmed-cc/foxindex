import { Module } from '@nestjs/common';
import { mailerProvider } from '../auth/mailer.provider';
import { OverviewService } from './overview.service';
import { PlatformController } from './platform.controller';
import { ProvidersService } from './providers.service';
import { StaffService } from './staff.service';

@Module({
  controllers: [PlatformController],
  providers: [OverviewService, ProvidersService, StaffService, mailerProvider],
})
export class PlatformModule {}
