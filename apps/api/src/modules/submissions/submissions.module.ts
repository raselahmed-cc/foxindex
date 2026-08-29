import { Module } from '@nestjs/common';
import { DomainsModule } from '../domains/domains.module';
import { UrlsModule } from '../urls/urls.module';
import { SubmissionsController } from './submissions.controller';
import { SubmissionsService } from './submissions.service';
import { SubmissionsRepository } from './submissions.repository';

@Module({
  imports: [DomainsModule, UrlsModule],
  controllers: [SubmissionsController],
  providers: [SubmissionsService, SubmissionsRepository],
  exports: [SubmissionsService],
})
export class SubmissionsModule {}
