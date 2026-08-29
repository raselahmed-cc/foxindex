import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { updateProjectSchema, type UpdateProjectInput } from '@foxindex/validation';
import { Role } from '@foxindex/types';
import { AuthGuard } from '../../common/guards/auth.guard';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
// Regular import — constructor-injected, see organizations.service.ts for why
// `import type` here would silently break Nest's DI.
import { ProjectsService } from './projects.service';

/** Item routes addressed directly by projectId — TenantContextGuard resolves the owning organization. */
@Controller('projects')
@UseGuards(AuthGuard, TenantContextGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get(':projectId')
  findOne(@Param('projectId') projectId: string) {
    return this.projects.findOne(projectId);
  }

  @Patch(':projectId')
  @UseGuards(RolesGuard)
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER)
  update(
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(updateProjectSchema)) body: UpdateProjectInput,
  ) {
    return this.projects.update(projectId, body);
  }
}
