import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { ProjectContextRequest, ProjectRow } from '../guards/project-ownership.guard';

export const CurrentProject = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ProjectRow =>
    context.switchToHttp().getRequest<ProjectContextRequest>().project,
);
