import { Module } from '@nestjs/common';
import { ProjectUrlsController } from './project-urls.controller';
import { UrlsController } from './urls.controller';
import { UrlsService } from './urls.service';
import { UrlsRepository } from './urls.repository';

@Module({
  controllers: [ProjectUrlsController, UrlsController],
  providers: [UrlsService, UrlsRepository],
  exports: [UrlsService, UrlsRepository],
})
export class UrlsModule {}
