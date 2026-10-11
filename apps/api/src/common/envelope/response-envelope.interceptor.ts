import { randomUUID } from 'node:crypto';
import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import type { ApiSuccessEnvelope } from '@foxindex/types';
import type { RequestWithId } from '../middleware/request-id.middleware';

/**
 * Wraps every successful HTTP controller return value in the {success, data, meta}
 * envelope (constitution §17). WebSocket acks are left untouched — socket clients
 * read the gateway's return value directly.
 */
@Injectable()
export class ResponseEnvelopeInterceptor<T> implements NestInterceptor<T, ApiSuccessEnvelope<T> | T> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiSuccessEnvelope<T> | T> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<RequestWithId>();
    return next.handle().pipe(
      map((data) => ({
        success: true as const,
        data,
        meta: {
          requestId: request.requestId ?? randomUUID(),
          timestamp: new Date().toISOString(),
        },
      })),
    );
  }
}
