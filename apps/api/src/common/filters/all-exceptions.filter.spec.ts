import { HttpStatus, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '@foxindex/types';
import type { Logger } from '@foxindex/logger';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { AuthorizationError, NotFoundError, ValidationError } from '../errors/app-error';
import type { RequestWithId } from '../middleware/request-id.middleware';

function makeHost(requestId = 'req_1') {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const request = { requestId, url: '/test', method: 'GET' } as RequestWithId;
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

function makeLogger(): Logger {
  return { error: vi.fn() } as unknown as Logger;
}

describe('AllExceptionsFilter', () => {
  let logger: Logger;
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    logger = makeLogger();
    filter = new AllExceptionsFilter(logger);
  });

  it('maps a ValidationError (AppError) to 400 with its code/message/details', () => {
    const { host, status, json } = makeHost();
    filter.catch(new ValidationError('bad input', [{ path: 'url', message: 'invalid' }]), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'bad input',
          details: [{ path: 'url', message: 'invalid' }],
        },
      }),
    );
  });

  it('maps AuthorizationError to 403', () => {
    const { host, status } = makeHost();
    filter.catch(new AuthorizationError(), host);
    expect(status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
  });

  it('maps NotFoundError to 404', () => {
    const { host, status } = makeHost();
    filter.catch(new NotFoundError('Project'), host);
    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
  });

  it('maps a built-in NestJS HttpException using its own status and message', () => {
    const { host, status, json } = makeHost();
    filter.catch(new NotFoundException('Route not found'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: ErrorCode.NOT_FOUND, message: 'Route not found' }),
      }),
    );
  });

  it('preserves a non-message object response body as `details` instead of dropping it', () => {
    const { host, json } = makeHost();
    filter.catch(new ServiceUnavailableException({ database: false, redis: true }), host);

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ details: { database: false, redis: true } }),
      }),
    );
  });

  it('never leaks internal detail for an unrecognized error — returns a generic 500', () => {
    const { host, status, json } = makeHost();
    filter.catch(new Error('some internal secret detail'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: { code: ErrorCode.INTERNAL_ERROR, message: 'An unexpected error occurred', details: undefined },
      }),
    );
  });

  it('logs the full detail (including stack) internally even though the response is sanitized', () => {
    const { host } = makeHost();
    filter.catch(new Error('some internal secret detail'), host);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'http.exception' }),
      'some internal secret detail',
    );
  });

  it('includes the request_id in both the response envelope and the log line', () => {
    const { host, json } = makeHost('req_xyz');
    filter.catch(new NotFoundError('Domain'), host);

    expect(json).toHaveBeenCalledWith(expect.objectContaining({ meta: expect.objectContaining({ requestId: 'req_xyz' }) }));
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'req_xyz' }), expect.any(String));
  });
});
