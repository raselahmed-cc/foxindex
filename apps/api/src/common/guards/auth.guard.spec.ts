import type { ExecutionContext } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();

vi.mock('@foxindex/auth', () => ({
  auth: { api: { getSession: getSession } },
}));

function makeContext(headers: Record<string, string> = {}): ExecutionContext {
  const request = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  beforeEach(() => {
    getSession.mockReset();
  });

  it('throws AuthenticationError when there is no session', async () => {
    getSession.mockResolvedValue(null);
    const { AuthGuard } = await import('./auth.guard');
    const { AuthenticationError } = await import('../errors/app-error');
    const guard = new AuthGuard();

    await expect(guard.canActivate(makeContext())).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('attaches user and sessionId to the request and allows the request through on a valid session', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user_1', email: 'a@b.com', name: 'A', emailVerified: true },
      session: { id: 'sess_1' },
    });
    const { AuthGuard } = await import('./auth.guard');
    const guard = new AuthGuard();

    const request: Record<string, unknown> = { headers: {} };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.user).toEqual({ id: 'user_1', email: 'a@b.com', name: 'A', emailVerified: true });
    expect(request.sessionId).toBe('sess_1');
  });
});
