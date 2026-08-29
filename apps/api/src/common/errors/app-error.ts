import { ErrorCode } from '@foxindex/types';

/**
 * constitution §36: errors are categorized, internal detail is logged, only a
 * safe message crosses the API boundary. AllExceptionsFilter maps `code` to the
 * HTTP status; throw AppError (or a subclass below) instead of a bare Error from
 * anywhere in a controller/service and the mapping happens automatically.
 */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(ErrorCode.VALIDATION_ERROR, message, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(ErrorCode.AUTHENTICATION_ERROR, message);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(ErrorCode.AUTHORIZATION_ERROR, message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(ErrorCode.NOT_FOUND, `${resource} not found`);
  }
}

export class RateLimitedError extends AppError {
  constructor(message = 'Too many requests') {
    super(ErrorCode.RATE_LIMITED, message);
  }
}
