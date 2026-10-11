import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { signAccessToken } from '@foxindex/auth';
import { UserRole, UserStatus } from '@foxindex/types';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard';
import { AuthenticationError } from '../errors/app-error';

const SECRET = 'test-secret';
const config = { getOrThrow: () => SECRET } as unknown as ConfigService;

function makeContext(headers: Record<string, string> = {}) {
  const request = { headers } as unknown as AuthenticatedRequest;
  const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  return { context, request };
}

describe('AuthGuard', () => {
  const guard = new AuthGuard(config);

  it('rejects a request without a bearer token', () => {
    expect(() => guard.canActivate(makeContext().context)).toThrow(AuthenticationError);
  });

  it('rejects a token signed with another secret', () => {
    const token = signAccessToken({ sub: 'u1', role: UserRole.CLIENT, status: UserStatus.ACTIVE }, 'other-secret');
    expect(() => guard.canActivate(makeContext({ authorization: `Bearer ${token}` }).context)).toThrow(AuthenticationError);
  });

  it('attaches the user from a valid token', () => {
    const token = signAccessToken({ sub: 'u1', role: UserRole.MANAGER, status: UserStatus.ACTIVE }, SECRET);
    const { context, request } = makeContext({ authorization: `Bearer ${token}` });
    expect(guard.canActivate(context)).toBe(true);
    expect(request.user).toEqual({ id: 'u1', role: UserRole.MANAGER, status: UserStatus.ACTIVE });
  });
});
