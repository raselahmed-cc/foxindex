import { type CallHandler, type ExecutionContext, Inject, Injectable, type NestInterceptor } from '@nestjs/common';
import { tap, type Observable } from 'rxjs';
import { logEvent, type Logger } from '@foxindex/logger';
import type { RequestWithId } from '../middleware/request-id.middleware';
import { LOGGER } from '../../logger/logger.module';

/** Structured request/response logging — never `console.log` (constitution §23). */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(@Inject(LOGGER) private readonly logger: Logger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<RequestWithId>();
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          logEvent(this.logger, 'http.request', `${request.method} ${request.url}`, {
            requestId: request.requestId,
            method: request.method,
            path: request.url,
            durationMs: Date.now() - startedAt,
          });
        },
        error: () => {
          // AllExceptionsFilter logs the error detail itself; this just records
          // that the request ended in a failure and how long it took.
          logEvent(this.logger, 'http.request.failed', `${request.method} ${request.url}`, {
            requestId: request.requestId,
            method: request.method,
            path: request.url,
            durationMs: Date.now() - startedAt,
          });
        },
      }),
    );
  }
}
