import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard';
import { UrlsService } from './urls.service';

/** Read-only: URL rows are only ever created as a side effect of a submission. */
@Controller('projects/:projectId/urls')
@UseGuards(AuthGuard, TenantContextGuard)
export class ProjectUrlsController {
  constructor(@Inject(UrlsService) private readonly urls: UrlsService) {}

  @Get()
  findAll(@Param('projectId') projectId: string) {
    return this.urls.findAllForProject(projectId);
  }
}
