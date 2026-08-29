import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
// Regular import — constructor-injected, see organizations.service.ts for why
// `import type` here would silently break Nest's DI.
import { Reflector } from '@nestjs/core';
import type { Role } from '@foxindex/types';
import { AuthorizationError } from '../errors/app-error';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { TenantContextRequest } from './tenant-context.guard';

/** Must run after TenantContextGuard (needs request.tenant.role). No @Roles() = any member allowed. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<TenantContextRequest>();
    if (!requiredRoles.includes(request.tenant.role)) {
      throw new AuthorizationError();
    }
    return true;
  }
}
