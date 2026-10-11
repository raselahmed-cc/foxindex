import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  createProjectSchema,
  updateProjectSchema,
  type CreateProjectInput,
  type UpdateProjectInput,
} from '@foxindex/validation';
import { AuthGuard, type SessionUser } from '../../common/guards/auth.guard';
import { ProjectOwnershipGuard } from '../../common/guards/project-ownership.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ProjectsService } from './projects.service';

/** Collection routes are user-scoped (session only); item routes are ownership-checked by ProjectOwnershipGuard. */
@Controller('projects')
@UseGuards(AuthGuard)
export class ProjectsController {
  constructor(@Inject(ProjectsService) private readonly projects: ProjectsService) {}

  @Post()
  create(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(createProjectSchema)) body: CreateProjectInput,
  ) {
    return this.projects.create(user.id, body);
  }

  @Get()
  findAll(@CurrentUser() user: SessionUser) {
    return this.projects.findAllForUser(user.id);
  }

  @Get(':projectId')
  @UseGuards(ProjectOwnershipGuard)
  findOne(@Param('projectId') projectId: string) {
    return this.projects.findOne(projectId);
  }

  @Patch(':projectId')
  @UseGuards(ProjectOwnershipGuard)
  update(
    @Param('projectId') projectId: string,
    @Body(new ZodValidationPipe(updateProjectSchema)) body: UpdateProjectInput,
  ) {
    return this.projects.update(projectId, body);
  }
}
