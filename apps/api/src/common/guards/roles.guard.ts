import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@foxindex/types';
import { AuthorizationError } from '../errors/app-error';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { TenantContextRequest } from './tenant-context.guard';

/** Must run after TenantContextGuard (needs request.tenant.role). No @Roles() = any member allowed. */
@Injectable()
export class RolesGuard implements CanActivate {
  // Explicit @Inject(ClassName) — see organizations.controller.ts.
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

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
