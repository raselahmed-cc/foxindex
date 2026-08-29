import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { Role } from '@foxindex/types';
import { RolesGuard } from './roles.guard';
import { AuthorizationError } from '../errors/app-error';
import type { TenantContextRequest } from './tenant-context.guard';

function makeContext(role: Role): ExecutionContext {
  const request = { tenant: { organizationId: 'org_1', role } } as TenantContextRequest;
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function makeReflector(requiredRoles: Role[] | undefined): Reflector {
  return { getAllAndOverride: () => requiredRoles } as unknown as Reflector;
}

describe('RolesGuard', () => {
  it('allows any member through when no @Roles() is set', () => {
    const guard = new RolesGuard(makeReflector(undefined));
    expect(guard.canActivate(makeContext(Role.VIEWER))).toBe(true);
  });

  it('allows a request when the member role is in the required list', () => {
    const guard = new RolesGuard(makeReflector([Role.OWNER, Role.ADMIN]));
    expect(guard.canActivate(makeContext(Role.ADMIN))).toBe(true);
  });

  it('rejects a request when the member role is not in the required list', () => {
    const guard = new RolesGuard(makeReflector([Role.OWNER, Role.ADMIN]));
    expect(() => guard.canActivate(makeContext(Role.VIEWER))).toThrow(AuthorizationError);
  });

  it('treats an empty @Roles() list the same as no decorator at all (unrestricted, not "deny all")', () => {
    const guard = new RolesGuard(makeReflector([]));
    expect(guard.canActivate(makeContext(Role.VIEWER))).toBe(true);
  });
});
