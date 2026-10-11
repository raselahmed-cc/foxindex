import { Module } from '@nestjs/common';
import { ProjectUrlsController } from './project-urls.controller';
import { UrlsService } from './urls.service';
import { UrlsRepository } from './urls.repository';

@Module({
  controllers: [ProjectUrlsController],
  providers: [UrlsService, UrlsRepository],
  exports: [UrlsService, UrlsRepository],
})
export class UrlsModule {}
