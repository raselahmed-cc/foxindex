import { randomUUID } from 'node:crypto';
import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import type { ApiSuccessEnvelope } from '@foxindex/types';
import type { RequestWithId } from '../middleware/request-id.middleware';

/** Wraps every successful controller return value in the {success, data, meta} envelope (constitution §17). */
@Injectable()
export class ResponseEnvelopeInterceptor<T> implements NestInterceptor<T, ApiSuccessEnvelope<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiSuccessEnvelope<T>> {
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
