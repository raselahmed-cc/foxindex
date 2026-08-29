import { Global, Module } from '@nestjs/common';
import { IDEMPOTENCY_CACHE, idempotencyCacheProvider } from './idempotency-cache.provider';

@Global()
@Module({
  providers: [idempotencyCacheProvider],
  exports: [IDEMPOTENCY_CACHE],
})
export class IdempotencyModule {}
