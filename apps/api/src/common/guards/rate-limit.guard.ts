import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type IORedis from 'ioredis';
import { RateLimitedError } from '../errors/app-error';
import { REDIS_CONNECTION } from '../../redis/redis.module';
import { RATE_LIMIT_KEY, type RateLimitOptions } from '../decorators/rate-limit.decorator';
import type { TenantContextRequest } from './tenant-context.guard';

/**
 * Organization-scoped fixed-window rate limiting (constitution §13's
 * "Organization" tier — Cloudflare/provider tiers are out of scope until
 * those are actually deployed). A simple INCR+EXPIRE counter, not a token
 * bucket — good enough for Phase 1's one rate-limited route and avoids
 * pulling in a rate-limiting library for a single use site.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(REDIS_CONNECTION) private readonly redis: IORedis,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<TenantContextRequest>();
    const identifier = request.tenant?.organizationId ?? request.ip ?? 'unknown';
    const key = `ratelimit:${options.scope}:${identifier}`;

    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, options.windowSeconds);
    }
    if (count > options.limit) {
      throw new RateLimitedError(
        `Rate limit exceeded: ${options.limit} requests per ${options.windowSeconds}s`,
      );
    }
    return true;
  }
}
