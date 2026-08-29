import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { TenantContextGuard, type TenantContext } from '../../common/guards/tenant-context.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { UrlsService } from './urls.service';

/** Item route addressed directly by urlId — TenantContextGuard resolves the owning project/organization. */
@Controller('urls')
@UseGuards(AuthGuard, TenantContextGuard)
export class UrlsController {
  constructor(@Inject(UrlsService) private readonly urls: UrlsService) {}

  @Get(':urlId')
  findOne(@Param('urlId') urlId: string, @CurrentTenant() tenant: TenantContext) {
    // Safe: on this route TenantContextGuard always resolves projectId from
    // the :urlId param itself (see its urlId branch) — projectId is only
    // ever absent when a route resolved via :organizationId alone.
    return this.urls.findOne(tenant.projectId!, urlId);
  }
}
