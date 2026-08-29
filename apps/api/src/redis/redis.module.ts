import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type IORedis from 'ioredis';
import { createRedisConnection } from '@foxindex/queue';
import { logEvent, type Logger } from '@foxindex/logger';
import { LOGGER } from '../logger/logger.module';

export const REDIS_CONNECTION = Symbol('REDIS_CONNECTION');

/** Global — shared by the idempotency cache, rate limiter, and BullMQ queue producers. */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CONNECTION,
      inject: [ConfigService, LOGGER],
      useFactory: (config: ConfigService, logger: Logger): IORedis => {
        const connection = createRedisConnection(config.getOrThrow<string>('REDIS_URL'));
        // Never assume Redis always works (constitution §30) — log connection
        // trouble through structured logging instead of letting it surface only
        // as ioredis's raw console spam or, worse, a crash.
        connection.on('error', (error: unknown) => {
          const message =
            (error instanceof AggregateError ? error.errors[0]?.message : undefined) ??
            (error instanceof Error ? error.message : String(error));
          logEvent(logger, 'redis.connection_error', 'Redis connection error', { message });
        });
        return connection;
      },
    },
  ],
  exports: [REDIS_CONNECTION],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_CONNECTION) private readonly redis: IORedis) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
