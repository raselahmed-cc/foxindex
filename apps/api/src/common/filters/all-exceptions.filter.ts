import { randomUUID } from 'node:crypto';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import type { Response } from 'express';
import { ErrorCode } from '@foxindex/types';
import type { Logger } from '@foxindex/logger';
import { AppError } from '../errors/app-error';
import type { RequestWithId } from '../middleware/request-id.middleware';
import { LOGGER } from '../../logger/logger.module';

const ERROR_CODE_TO_STATUS: Record<ErrorCode, number> = {
  [ErrorCode.VALIDATION_ERROR]: HttpStatus.BAD_REQUEST,
  [ErrorCode.AUTHENTICATION_ERROR]: HttpStatus.UNAUTHORIZED,
  [ErrorCode.AUTHORIZATION_ERROR]: HttpStatus.FORBIDDEN,
  [ErrorCode.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ErrorCode.RATE_LIMITED]: HttpStatus.TOO_MANY_REQUESTS,
  [ErrorCode.PROVIDER_ERROR]: HttpStatus.BAD_GATEWAY,
  [ErrorCode.NETWORK_ERROR]: HttpStatus.GATEWAY_TIMEOUT,
  [ErrorCode.DATABASE_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
  [ErrorCode.QUEUE_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
  [ErrorCode.INTERNAL_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
};

/**
 * Single place every thrown error passes through on its way to the client
 * (constitution §36): categorized error code, safe external message, full detail
 * logged internally only, never a raw stack trace in the response body.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(@Inject(LOGGER) private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();
    const requestId = request?.requestId ?? randomUUID();

    const { status, code, message, details } = this.classify(exception);
    // Log the raw exception's own message, not the sanitized client-facing one
    // — for an unrecognized error these differ (client gets "An unexpected
    // error occurred"), and internal logs should carry the real detail.
    const internalMessage = exception instanceof Error ? exception.message : message;

    this.logger.error(
      {
        event: 'http.exception',
        requestId,
        errorCode: code,
        statusCode: status,
        path: request?.url,
        method: request?.method,
        stack: exception instanceof Error ? exception.stack : undefined,
      },
      internalMessage,
    );

    response.status(status).json({
      success: false,
      error: { code, message, details },
      meta: { requestId, timestamp: new Date().toISOString() },
    });
  }

  private classify(exception: unknown): {
    status: number;
    code: ErrorCode;
    message: string;
    details?: unknown;
  } {
    if (exception instanceof AppError) {
      return {
        status: ERROR_CODE_TO_STATUS[exception.code],
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = this.codeForHttpStatus(status);
      const responseBody = exception.getResponse();

      if (typeof responseBody === 'string') {
        return { status, code, message: responseBody };
      }

      // e.g. `new ServiceUnavailableException({database: false, redis: false})`
      // — Nest stores that object as-is with no `message` key, so preserve it
      // as `details` instead of silently dropping it and falling back to a
      // generic "Service Unavailable Exception" with nothing underneath.
      const { message: rawMessage, ...rest } = responseBody as {
        message?: string | string[];
        [key: string]: unknown;
      };
      const message = rawMessage
        ? Array.isArray(rawMessage)
          ? rawMessage.join('; ')
          : rawMessage
        : exception.message;
      return {
        status,
        code,
        message,
        details: Object.keys(rest).length > 0 ? rest : undefined,
      };
    }

    // Unknown/unexpected error: never leak internal detail externally.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred',
    };
  }

  private codeForHttpStatus(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return ErrorCode.VALIDATION_ERROR;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.AUTHENTICATION_ERROR;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.AUTHORIZATION_ERROR;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.RATE_LIMITED;
      default:
        return ErrorCode.INTERNAL_ERROR;
    }
  }
}
