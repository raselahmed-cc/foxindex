import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { TenantContext, TenantContextRequest } from '../guards/tenant-context.guard';

export const CurrentTenant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TenantContext =>
    context.switchToHttp().getRequest<TenantContextRequest>().tenant,
);
