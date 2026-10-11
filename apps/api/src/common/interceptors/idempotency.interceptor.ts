import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { catchError, from, of, switchMap, tap, type Observable } from 'rxjs';
import type { IdempotencyCache } from '@foxindex/queue';
import { RateLimitedError } from '../errors/app-error';
import { IDEMPOTENCY_CACHE } from '../idempotency/idempotency-cache.provider';
import type { CallerRequest } from '../guards/caller-request';

const HEADER = 'idempotency-key';

/**
 * Backs the Idempotency-Key header (constitution §18) on mutating endpoints —
 * a client retry that reuses the same key either proceeds (first attempt),
 * gets told to back off (a concurrent attempt is still running), or gets the
 * exact prior response replayed, never a second side effect. Must run after
 * AuthGuard/ApiKeyGuard (needs request.user or request.apiKey) —
 * guards always complete before any interceptor in Nest's request lifecycle,
 * so ordering is automatic regardless of decorator placement.
 *
 * Scoped by user id for a session caller, or by the API key's own project id
 * (docs/adr/0013 — an API key doesn't carry a user id directly, and its
 * project id is a stable per-caller identifier for this purpose too).
 *
 * Observes the RAW (pre-envelope) return value from the handler: this
 * interceptor is method-scoped, while ResponseEnvelopeInterceptor is global
 * and therefore wraps *outside* it — so replaying the cached raw value here
 * still gets a fresh {success, data, meta} envelope from the outer
 * interceptor, which is correct (only the data needs to be idempotent, not
 * the request_id/timestamp).
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(IDEMPOTENCY_CACHE) private readonly cache: IdempotencyCache) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<CallerRequest>();
    const idempotencyKey = request.headers[HEADER];
    const scopeId = request.user?.id ?? request.apiKey?.userId;

    if (!idempotencyKey || typeof idempotencyKey !== 'string' || !scopeId) {
      return next.handle();
    }

    return from(this.cache.begin(scopeId, idempotencyKey)).pipe(
      switchMap((begin) => {
        if (begin.status === 'cached') {
          return of(begin.response);
        }
        if (begin.status === 'in-flight') {
          throw new RateLimitedError(
            'A request with this Idempotency-Key is already being processed',
          );
        }
        return next.handle().pipe(
          tap((response) => {
            void this.cache.complete(scopeId, idempotencyKey, response);
          }),
          catchError((error: unknown) => {
            void this.cache.release(scopeId, idempotencyKey);
            throw error;
          }),
        );
      }),
    );
  }
}
