import { Controller, Get, HttpCode, HttpStatus, Inject, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Database } from '@foxindex/database';
import type IORedis from 'ioredis';
import { DATABASE } from '../../database/database.module';
import { REDIS_CONNECTION } from '../../redis/redis.module';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(REDIS_CONNECTION) private readonly redis: IORedis,
  ) {}

  /** Liveness — process is up. No dependency checks (constitution §30). */
  @Get()
  @HttpCode(HttpStatus.OK)
  liveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Readiness — safe to receive traffic. Checks the dependencies a request actually needs. */
  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async readiness(): Promise<{ status: 'ok'; database: boolean; redis: boolean }> {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);
    if (!database || !redis) {
      throw new ServiceUnavailableException({ database, redis });
    }
    return { status: 'ok', database, redis };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.withTimeout(this.db.execute(sql`select 1`), 2000);
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      // The shared connection is also used by BullMQ, which legitimately blocks
      // on Redis for long periods waiting for jobs — it must NOT carry a global
      // command timeout (that would break blocking reads), so a queued PING
      // issued while Redis is down would otherwise wait forever. Bound just
      // this call instead of the connection itself.
      return (await this.withTimeout(this.redis.ping(), 2000)) === 'PONG';
    } catch {
      return false;
    }
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Health check timed out')), timeoutMs);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }
}
