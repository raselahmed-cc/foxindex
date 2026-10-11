import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { UserRole } from '@foxindex/types';
import { RolesGuard } from './roles.guard';
import { AuthorizationError } from '../errors/app-error';
import type { AuthenticatedRequest } from './auth.guard';

function makeContext(role: UserRole): ExecutionContext {
  const request = { user: { role } } as unknown as AuthenticatedRequest;
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function makeReflector(requiredRoles: UserRole[] | undefined): Reflector {
  return { getAllAndOverride: () => requiredRoles } as unknown as Reflector;
}

describe('RolesGuard', () => {
  it('allows any authenticated user through when no @Roles() is set', () => {
    const guard = new RolesGuard(makeReflector(undefined));
    expect(guard.canActivate(makeContext(UserRole.USER))).toBe(true);
  });

  it('allows a request when the user role is in the required list', () => {
    const guard = new RolesGuard(makeReflector([UserRole.ADMIN, UserRole.SUPER_ADMIN]));
    expect(guard.canActivate(makeContext(UserRole.ADMIN))).toBe(true);
  });

  it('rejects a request when the user role is not in the required list', () => {
    const guard = new RolesGuard(makeReflector([UserRole.ADMIN, UserRole.SUPER_ADMIN]));
    expect(() => guard.canActivate(makeContext(UserRole.USER))).toThrow(AuthorizationError);
  });

  it('treats an empty @Roles() list the same as no decorator at all (unrestricted, not "deny all")', () => {
    const guard = new RolesGuard(makeReflector([]));
    expect(guard.canActivate(makeContext(UserRole.USER))).toBe(true);
  });
});
