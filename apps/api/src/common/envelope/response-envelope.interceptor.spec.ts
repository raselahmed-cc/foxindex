import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor';
import type { RequestWithId } from '../middleware/request-id.middleware';

function makeContext(requestId: string): ExecutionContext {
  const request = { requestId } as RequestWithId;
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function makeHandler<T>(value: T): CallHandler<T> {
  return { handle: () => of(value) };
}

describe('ResponseEnvelopeInterceptor', () => {
  it('wraps the handler value in {success, data, meta}', async () => {
    const interceptor = new ResponseEnvelopeInterceptor();
    const result = await firstValueFrom(
      interceptor.intercept(makeContext('req_1'), makeHandler({ id: '123' })),
    );

    expect(result).toEqual({
      success: true,
      data: { id: '123' },
      meta: { requestId: 'req_1', timestamp: expect.any(String) },
    });
  });

  it('carries the request_id from the request through to meta', async () => {
    const interceptor = new ResponseEnvelopeInterceptor();
    const result = await firstValueFrom(
      interceptor.intercept(makeContext('req_abc'), makeHandler(null)),
    );

    expect(result.meta?.requestId).toBe('req_abc');
  });

  it('wraps primitive and array values the same way as objects', async () => {
    const interceptor = new ResponseEnvelopeInterceptor();
    const result = await firstValueFrom(
      interceptor.intercept(makeContext('req_2'), makeHandler([1, 2, 3])),
    );

    expect(result.data).toEqual([1, 2, 3]);
  });
});

describe('ResponseEnvelopeInterceptor (websocket)', () => {
  it('passes websocket acks through unwrapped', async () => {
    const { of, lastValueFrom } = await import('rxjs');
    const { ResponseEnvelopeInterceptor } = await import('./response-envelope.interceptor');
    const context = { getType: () => 'ws' } as unknown as import('@nestjs/common').ExecutionContext;
    const result = await lastValueFrom(new ResponseEnvelopeInterceptor().intercept(context, { handle: () => of({ ok: true }) }));
    expect(result).toEqual({ ok: true });
  });
});
